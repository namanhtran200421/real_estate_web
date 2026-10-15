// Book → payment (upload a transfer screenshot, accept the policy) → confirmation still works end to end.
// Needs the local API on a disposable database (see e2e/README.md). The API allows 3 pending holds per IP:
// expire earlier test holds first with
//   psql postgresql://localhost/real_estate_test -c "UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE status='pending' AND amount_paid=0 AND customer_email LIKE 'check%@example.com'"
export default async function check({ browser, site, assert, lib }) {
  const api = process.env.API ?? 'http://localhost:3000/api/v1';
  const day = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
  const stamp = Date.now() % 100000;
  const identity = (fullName, documentNumber, dateOfBirth) => ({
    documentType: 'cccd',
    nationality: 'VN',
    fullName,
    dateOfBirth,
    documentNumber,
    addressOnDocument: 'Hà Nội',
    issueDate: '2021-01-01',
    expiryDate: '2031-01-01',
    stayReason: 'Du lịch',
  });
  const offset = 200 + (stamp % 100);
  const res = await fetch(`${api}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: site },
    body: JSON.stringify({
      apartmentSlug: 'sun-garden-a04-12',
      checkIn: day(offset),
      checkOut: day(offset + 2),
      guests: 2,
      customer: { name: 'Kiểm tra', phone: `0912${String(stamp).padStart(6, '0')}`, email: `check${stamp}@example.com` },
      guestIdentities: [identity('Hoàng Hải', '001090000001', '1990-01-01'), identity('Nguyễn An', '001092000002', '1992-02-02')],
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  const { data } = body;
  const page = await lib.openPage(browser, { viewport: lib.VIEWPORTS.phone });
  const { errors } = lib.captureErrors(page);
  const newLook = async (label) => {
    assert.ok(await page.locator('h1.display-section').count(), `${label}: the title is not .display-section`);
    assert.ok(await page.locator('main .panel').count(), `${label}: no .panel`);
    assert.equal(await page.locator('main .card').count(), 0, `${label}: still has .card containers`);
  };
  // The guest's browser remembers the access token of the booking it just made.
  await page.context().addInitScript(([ref, token]) => localStorage.setItem('booking-access-tokens', JSON.stringify({ [ref]: token })), [data.booking.reference, data.accessToken]);
  await page.goto(`${site}/book/payment?ref=${data.booking.reference}`, { waitUntil: 'networkidle' });
  await page.locator('img[alt^="Mã VietQR"], img[alt^="VietQR"], img[alt*="VietQR"]').first().waitFor();

  // The new look: a display-section title, paper panels instead of cards.
  await newLook('payment');
  const policy = page.locator('#accept-policy');
  await policy.scrollIntoViewIfNeeded();
  const continueButton = page.getByRole('button', { name: /Tiếp tục thanh toán|Continue/ });
  assert.equal(await continueButton.isDisabled(), true, 'continue is disabled before a screenshot and the policy');

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /Tải ảnh chuyển khoản|Upload transfer screenshot/ }).first().click(),
  ]);
  await chooser.setFiles(new URL('../../../../backend/src/modules/payments/fixtures/transfer-screenshot.png', import.meta.url).pathname);
  await page.locator('img[alt="Ảnh chuyển khoản bạn đã chọn"], img[alt*="screenshot you chose" i]').last().waitFor();
  assert.equal(await continueButton.isDisabled(), true, 'continue stays disabled until the policy is ticked');
  await policy.check();
  await lib.shot(page, 'booking-flow-payment');
  await continueButton.click();

  // A screenshot the reader finds no transfer in is a nudge, never a dead end.
  const target = `**/booking/${data.booking.reference}/confirmation`;
  const sendAnyway = page.getByRole('button', { name: /Vẫn gửi ảnh này|Send (this )?anyway/i });
  const first = await Promise.race([page.waitForURL(target).then(() => 'done'), sendAnyway.waitFor().then(() => 'nudge')]);
  if (first === 'nudge') {
    await sendAnyway.click();
    await page.waitForURL(target);
  }
  await page.waitForLoadState('networkidle');
  await lib.shot(page, 'booking-flow-confirmation');
  await newLook('confirmation');
  assert.equal(new URL(page.url()).pathname, `/booking/${data.booking.reference}/confirmation`);
  assert.deepEqual(errors, [], 'console errors during the booking flow');
  await page.context().close();
}
