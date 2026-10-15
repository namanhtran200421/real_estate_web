import { ApplicationInitStatus } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeVi from '@angular/common/locales/vi';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18n } from '../../i18n/i18n';
import { Booking, BookingFinancials } from '../../models/booking';
import { ApartmentService } from '../../services/apartment.service';
import { BookingDraftService } from '../../services/booking-draft.service';
import { BookingService } from '../../services/booking.service';
import { BookingConfirmation } from './booking-confirmation';

registerLocaleData(localeVi);

function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

const FINANCIALS: BookingFinancials = {
  assetSecurityRequired: 400_000,
  assetSecurityReceived: 0,
  assetSecurityRefunded: 0,
  assetSecurityApplied: 0,
  assetSecurityHeld: 0,
  assetSecurityDue: 400_000,
  incidentCharges: 0,
  incidentPayments: 0,
  incidentAmountDue: 0,
};

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    reference: 'ABC-123',
    apartmentSlug: 'apt',
    checkIn: day(10),
    checkOut: day(12),
    guests: 2,
    customer: { name: 'Lan', phone: '0900000000', email: 'lan@example.com' },
    message: null,
    quote: {
      lines: [],
      subtotal: 2_000_000,
      stayDiscount: null,
      promo: null,
      discountTotal: 0,
      total: 2_000_000,
      depositPercent: 20,
      deposit: 400_000,
      nights: 2,
    },
    status: 'pending',
    paymentStatus: 'unpaid',
    amountPaid: 0,
    amountDue: 2_000_000,
    depositFirst: true,
    rentDueFrom: day(10),
    financials: FINANCIALS,
    paymentOptions: { deposit: null, full: null, assetSecurity: 400_000, incident: null },
    holdExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    pendingTransfer: null,
    createdAt: new Date().toISOString(),
    payments: [],
    incidents: [],
    ...overrides,
  };
}

async function render(booking: Booking): Promise<HTMLElement> {
  await TestBed.configureTestingModule({
    imports: [BookingConfirmation],
    providers: [
      provideRouter([]),
      provideI18n(),
      { provide: BookingService, useValue: { get: vi.fn().mockResolvedValue(booking) } },
      { provide: ApartmentService, useValue: { bySlug: () => undefined } },
      { provide: BookingDraftService, useValue: { clear: vi.fn() } },
    ],
  }).compileComponents();
  // TestBed does not wait for async app initializers; the language file loads in one.
  await TestBed.inject(ApplicationInitStatus).donePromise;
  const fixture = TestBed.createComponent(BookingConfirmation);
  fixture.componentRef.setInput('reference', booking.reference);
  for (let i = 0; i < 6; i++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return fixture.nativeElement as HTMLElement;
}

describe('BookingConfirmation (deposit-first)', () => {
  it('offers to pay the deposit while the booking is pending', async () => {
    const el = await render(makeBooking());
    const links = [...el.querySelectorAll('a')].filter((a) => a.textContent?.includes('Thanh toán tiền đặt cọc'));
    expect(links.length).toBe(1);
  });

  it('shows the confirmed header once the deposit is in, with the rent timeline', async () => {
    const el = await render(
      makeBooking({
        status: 'confirmed',
        paymentStatus: 'deposit_paid',
        amountPaid: 400_000,
        financials: { ...FINANCIALS, assetSecurityReceived: 400_000, assetSecurityHeld: 400_000, assetSecurityDue: 0 },
        paymentOptions: { deposit: null, full: null, assetSecurity: null, incident: null },
      }),
    );
    expect(el.textContent).toContain('Đặt phòng đã được xác nhận');
    expect(el.textContent).toContain('Đã nhận');
    expect(el.textContent).toContain('Sau khi trả phòng và kiểm tra căn hộ');
  });

  it('keeps the old layout for a legacy booking', async () => {
    const el = await render(
      makeBooking({
        depositFirst: false,
        rentDueFrom: null,
        paymentOptions: { deposit: 400_000, full: 2_000_000, assetSecurity: null, incident: null },
      }),
    );
    expect(el.textContent).toContain('Thanh toán và gửi ảnh');
    expect(el.textContent).not.toContain('Tiền đặt cọc, tiền phòng và hoàn cọc');
  });

  it('shows the old asset section for a legacy booking with a deposit', async () => {
    const el = await render(
      makeBooking({
        depositFirst: false,
        rentDueFrom: null,
        status: 'confirmed',
        amountPaid: 400_000,
        paymentOptions: { deposit: null, full: null, assetSecurity: null, incident: null },
      }),
    );
    expect(el.textContent).toContain('Tiền đặt cọc và bồi thường');
    expect(el.textContent).not.toContain('Hoàn cọc');
  });

  it('adds up for a deposit-first guest: the rent block counts only rent, the deposit has its own line', async () => {
    const el = await render(
      makeBooking({
        status: 'confirmed',
        paymentStatus: 'deposit_paid',
        amountPaid: 1_500_000,
        amountDue: 500_000,
        financials: { ...FINANCIALS, assetSecurityReceived: 400_000, assetSecurityHeld: 400_000, assetSecurityDue: 0 },
        paymentOptions: { deposit: null, full: 500_000, assetSecurity: null, incident: null },
        payments: [
          { id: 'p1', provider: 'bank_transfer', purpose: 'asset_security', amount: 400_000, state: 'succeeded', paidAt: day(-5), createdAt: day(-5) },
          { id: 'p2', provider: 'cash', purpose: 'accommodation', amount: 1_500_000, state: 'succeeded', paidAt: day(0), createdAt: day(0) },
        ],
      }),
    );

    const rent = el.querySelector('[data-summary="rent"]')!;
    expect(rent.textContent).toContain('Tiền phòng · ');
    expect(rent.textContent).toContain('1.500.000');
    expect(rent.textContent).toContain('500.000');
    expect(rent.textContent).not.toContain('400.000');
    expect(rent.textContent).not.toContain('Tiền đặt cọc');
    const other = el.querySelector('[data-summary="other"]')!;
    expect(other.textContent).toContain('Tiền đặt cọc · ');
    expect(other.textContent).toContain('400.000');
  });

  it('never shows the rent as waiting for confirmation while the deposit transfer is checked', async () => {
    const el = await render(
      makeBooking({
        pendingTransfer: { amount: 400_000, purpose: 'asset_security', reportedAt: new Date().toISOString(), hasScreenshot: true },
        paymentOptions: { deposit: null, full: null, assetSecurity: null, incident: null },
      }),
    );
    const text = (el.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('Tiền phòng · thanh toán từ');
    expect(text).toContain('Đang kiểm tra chuyển khoản cọc');
    expect(text).not.toMatch(/Đang chờ chủ nhà xác nhận\s*2\.000\.000/);
  });

  it('labels a damage payment, and offers damage charges by their name', async () => {
    const el = await render(
      makeBooking({
        status: 'completed',
        amountPaid: 2_000_000,
        amountDue: 0,
        financials: { ...FINANCIALS, incidentCharges: 150_000, incidentPayments: 50_000, incidentAmountDue: 100_000 },
        paymentOptions: { deposit: null, full: null, assetSecurity: null, incident: 100_000 },
        payments: [
          { id: 'p3', provider: 'cash', purpose: 'incident', amount: 50_000, state: 'succeeded', paidAt: day(0), createdAt: day(0) },
        ],
      }),
    );

    expect(el.querySelector('[data-summary="other"]')!.textContent).toContain('Bồi thường · ');
    expect(el.textContent).toContain('Thanh toán tiền bồi thường');
    expect(el.textContent).not.toContain('khoản tài sản');
  });

  it('renders a booking from an API older than deposit-first payments', async () => {
    const older = makeBooking({ depositFirst: false, paymentOptions: { deposit: 400_000, full: 2_000_000 } as Booking['paymentOptions'] });
    for (const field of ['financials', 'incidents', 'depositFirst', 'rentDueFrom'] as const) delete older[field];

    const el = await render(older);

    expect(el.textContent).toContain('Thanh toán và gửi ảnh');
    expect(el.textContent).not.toContain('Tiền đặt cọc và bồi thường');
  });
});
