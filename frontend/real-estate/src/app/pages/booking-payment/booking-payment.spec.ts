import { registerLocaleData } from '@angular/common';
import localeVi from '@angular/common/locales/vi';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18n } from '../../i18n/i18n';
import { Booking } from '../../models/booking';
import { ApartmentService } from '../../services/apartment.service';
import { BookingService } from '../../services/booking.service';
import { BookingPayment } from './booking-payment';

registerLocaleData(localeVi);

function future(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    reference: 'ABC-123',
    apartmentSlug: 'apt',
    checkIn: future(10),
    checkOut: future(12),
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
    rentDueFrom: future(10),
    financials: {
      assetSecurityRequired: 400_000,
      assetSecurityReceived: 0,
      assetSecurityRefunded: 0,
      assetSecurityApplied: 0,
      assetSecurityHeld: 0,
      assetSecurityDue: 400_000,
      incidentCharges: 0,
      incidentPayments: 0,
      incidentAmountDue: 0,
    },
    paymentOptions: { deposit: null, full: null, assetSecurity: 400_000, incident: null },
    holdExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    pendingTransfer: null,
    createdAt: new Date().toISOString(),
    payments: [],
    incidents: [],
    ...overrides,
  };
}

async function render(booking: Booking) {
  const bookings = {
    get: vi.fn().mockResolvedValue(booking),
    transferInstructions: vi.fn().mockResolvedValue({
      bankName: 'Bank',
      accountNumber: '123',
      accountName: 'Owner',
      amount: 400_000,
      note: 'ABC123',
      qrImage: 'data:image/png;base64,AAAA',
    }),
    reportTransfer: vi.fn().mockResolvedValue(booking),
  };
  await TestBed.configureTestingModule({
    imports: [BookingPayment],
    providers: [
      provideRouter([]),
      provideI18n(),
      { provide: BookingService, useValue: bookings },
      { provide: ApartmentService, useValue: { bySlug: () => undefined } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(BookingPayment);
  fixture.componentRef.setInput('ref', booking.reference);
  for (let i = 0; i < 6; i++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return { fixture, el: fixture.nativeElement as HTMLElement, bookings };
}

describe('BookingPayment', () => {
  it('keeps the continue button disabled until the policy box is ticked', async () => {
    const { fixture, el } = await render(makeBooking());
    const component = fixture.componentInstance as unknown as {
      screenshot: { set(value: unknown): void };
    };
    component.screenshot.set({ blob: new Blob(['x'], { type: 'image/png' }), previewUrl: 'blob:x' });
    fixture.detectChanges();

    const button = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Tiếp tục thanh toán'))!;
    expect(button.disabled).toBe(true);
    expect(el.textContent).toContain('Vui lòng đánh dấu đồng ý với chính sách lưu trú để tiếp tục.');

    const box = el.querySelector<HTMLInputElement>('#accept-policy')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
    expect(el.textContent).not.toContain('Vui lòng đánh dấu đồng ý');
  });

  it('shows only the deposit card, with the rent line, for a pending deposit-first booking', async () => {
    const { el } = await render(makeBooking());
    const radios = el.querySelectorAll('input[name="amount"]');
    expect(radios.length).toBe(1);
    expect(el.textContent).toContain('Tiền đặt cọc (20%)');
    expect(el.textContent).toContain('Tiền phòng');
    expect(el.textContent).toContain('thanh toán từ ngày nhận phòng');
  });

  it('says the booking is confirmed and the rent is due later, not "contact the owner"', async () => {
    const { el } = await render(
      makeBooking({
        status: 'confirmed',
        paymentStatus: 'deposit_paid',
        amountPaid: 400_000,
        holdExpiresAt: null,
        paymentOptions: { deposit: null, full: null, assetSecurity: null, incident: null },
      }),
    );
    expect(el.textContent).toContain('Đặt phòng đã được xác nhận');
    expect(el.textContent).toContain('Tiền phòng thanh toán từ ngày');
    expect(el.textContent).not.toContain('Vui lòng liên hệ chủ nhà');
  });
});
