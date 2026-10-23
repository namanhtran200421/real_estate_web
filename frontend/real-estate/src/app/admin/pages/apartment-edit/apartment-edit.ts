import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { API_URL, ApiError, toApiError } from '../../../core/api';
import { ApartmentService } from '../../../services/apartment.service';
import { AdminApiService } from '../../admin-api.service';
import { AdminApartment, ApartmentInput } from '../../admin.types';
import { Photo } from '../../../models/apartment';
import { photoUrl } from '../../../shared/photo-url';
import { formatChecklist, parseChecklist } from '../../inspection-checklist';

/**
 * The editor's state. List fields are edited as text, one item per line
 * ("a | b" for pairs), which is quick to type and paste.
 */
interface ApartmentForm {
  slug: string;
  name: string;
  area: string;
  address: string;
  mapQuery: string;
  tagline: string;
  description: string;
  photos: Photo[];
  guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  keyFacilities: string;
  facilities: string;
  checkIn: string;
  checkOut: string;
  rules: string;
  nearby: string;
  weekday: number;
  weekend: number;
  holiday: number;
  weekly: number;
  monthly: number;
  longStayDiscounts: string;
  depositPercent: number;
  inspectionChecklist: string;
  isActive: boolean;
  sortOrder: number;
}

type EditorFieldKey = Exclude<keyof ApartmentForm, 'photos' | 'isActive'>;
interface EditorField {
  key: EditorFieldKey;
  label: string;
  type?: 'number' | 'time' | 'textarea';
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  rows?: number;
  wide?: boolean;
  placeholder?: string;
  hint?: string;
}
interface PhotoUpload {
  id: number;
  file: File;
  preview: string;
  status: 'uploading' | 'error';
  error?: string;
}

const EMPTY: ApartmentForm = {
  slug: '',
  name: '',
  area: '',
  address: '',
  mapQuery: '',
  tagline: '',
  description: '',
  photos: [],
  guests: 2,
  bedrooms: 1,
  beds: 1,
  bathrooms: 1,
  keyFacilities: '',
  facilities: '',
  checkIn: '14:00',
  checkOut: '12:00',
  rules: '',
  nearby: '',
  weekday: 0,
  weekend: 0,
  holiday: 0,
  weekly: 0,
  monthly: 0,
  longStayDiscounts: '',
  depositPercent: 30,
  inspectionChecklist: '',
  isActive: false,
  sortOrder: 0,
};

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** "a | b" per line. */
const pairs = (text: string) =>
  lines(text).map((line) => line.split('|').map((part) => part.trim()));

function toForm(apartment: AdminApartment): ApartmentForm {
  const checklist = apartment.inspectionChecklist.length
    ? apartment.inspectionChecklist
    : apartment.defaultInspectionChecklist;
  return {
    ...apartment,
    inspectionChecklist: formatChecklist(checklist),
    description: apartment.description.join('\n\n'),
    photos: apartment.photos.map((photo) => ({ ...photo })),
    keyFacilities: apartment.keyFacilities.join('\n'),
    facilities: apartment.facilities.join('\n'),
    rules: apartment.rules.join('\n'),
    nearby: apartment.nearby.map((n) => `${n.place} | ${n.distance}`).join('\n'),
    ...apartment.pricing,
    longStayDiscounts: apartment.pricing.longStayDiscounts
      .map((d) => `${d.nights} | ${d.percent}`)
      .join('\n'),
  };
}

/**
 * The checklist to save. The editor shows the default while the apartment has none; leaving that
 * text untouched keeps the apartment on the default (an empty list) instead of freezing a copy.
 */
function checklistToSave(text: string, shownDefault: string | undefined) {
  if (shownDefault !== undefined && text.trim() === shownDefault.trim()) return [];
  return parseChecklist(text);
}

function fromForm(form: ApartmentForm, shownDefault?: string): ApartmentInput {
  return {
    slug: form.slug.trim(),
    name: form.name.trim(),
    area: form.area.trim(),
    address: form.address.trim(),
    mapQuery: form.mapQuery.trim(),
    tagline: form.tagline.trim(),
    description: form.description
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    photos: form.photos,
    guests: form.guests,
    bedrooms: form.bedrooms,
    beds: form.beds,
    bathrooms: form.bathrooms,
    keyFacilities: lines(form.keyFacilities),
    facilities: lines(form.facilities),
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    rules: lines(form.rules),
    nearby: pairs(form.nearby).map(([place, distance]) => ({ place, distance: distance ?? '' })),
    pricing: {
      weekday: form.weekday,
      weekend: form.weekend,
      holiday: form.holiday,
      weekly: form.weekly,
      monthly: form.monthly,
      longStayDiscounts: pairs(form.longStayDiscounts).map(([nights, percent]) => ({
        nights: Number(nights),
        percent: Number(percent),
      })),
    },
    depositPercent: form.depositPercent,
    inspectionChecklist: checklistToSave(form.inspectionChecklist, shownDefault),
    isActive: form.isActive,
    sortOrder: form.sortOrder,
  };
}

@Component({
  selector: 'app-admin-apartment-edit',
  imports: [RouterLink, NgTemplateOutlet],
  styleUrl: './apartment-edit.css',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  templateUrl: './apartment-edit.html',
})
export class AdminApartmentEdit {
  private readonly api = inject(AdminApiService);
  private readonly apiUrl = inject(API_URL);
  private readonly destroyRef = inject(DestroyRef);
  private alive = true;
  private nextUploadId = 0;
  private slugEdited = false;
  private readonly router = inject(Router);
  private readonly publicApartments = inject(ApartmentService);

  /** Bound from the `:slug` route param; absent when creating. */
  readonly slug = input<string>();

  protected readonly form = signal<ApartmentForm>({ ...EMPTY });
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly changed = signal(false);
  protected readonly leavePrompt = signal(false);
  private leaveDecision?: (allow: boolean) => void;
  protected readonly error = signal<ApiError | undefined>(undefined);
  /** The default checklist text, while the editor shows it because the apartment has no list of its own. */
  private shownDefault: string | undefined;

  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly uploads = signal<PhotoUpload[]>([]);
  protected readonly uploading = computed(() =>
    this.uploads().some((file) => file.status === 'uploading'),
  );
  protected readonly dragOver = signal(false);
  protected readonly photoNotice = signal('');
  protected readonly loadFailed = signal(false);
  protected readonly sections = [
    { id: 'information', label: 'Thông tin' },
    { id: 'photos', label: 'Hình ảnh' },
    { id: 'pricing', label: 'Giá phòng' },
    { id: 'details', label: 'Tiện nghi' },
    { id: 'settings', label: 'Cài đặt' },
  ];
  protected readonly information: EditorField[] = [
    {
      key: 'name',
      label: 'Tên căn hộ',
      required: true,
      maxLength: 120,
      placeholder: 'Ví dụ: Sun Garden Đà Lạt',
    },
    {
      key: 'area',
      label: 'Khu vực',
      required: true,
      maxLength: 120,
      placeholder: 'Nam Hồ · Đà Lạt',
    },
    {
      key: 'address',
      label: 'Địa chỉ',
      required: true,
      maxLength: 250,
      wide: true,
      placeholder: 'Số nhà, tên đường, phường, thành phố',
    },
    {
      key: 'mapQuery',
      label: 'Địa điểm trên Google Maps',
      required: true,
      maxLength: 250,
      wide: true,
      placeholder: 'Tên căn hộ hoặc địa chỉ trên bản đồ',
      hint: 'Dùng địa chỉ đầy đủ để khách dễ tìm đường.',
    },
    {
      key: 'tagline',
      label: 'Giới thiệu ngắn',
      required: true,
      maxLength: 250,
      wide: true,
      placeholder: 'Một câu giới thiệu nét riêng của căn hộ',
      hint: 'Hiển thị trên thẻ căn hộ.',
    },
    {
      key: 'description',
      label: 'Mô tả căn hộ',
      type: 'textarea',
      rows: 5,
      wide: true,
      placeholder: 'Không gian, điểm nổi bật và trải nghiệm lưu trú…',
      hint: 'Cách các đoạn bằng một dòng trống.',
    },
  ];
  protected readonly capacity: EditorField[] = [
    { key: 'guests', label: 'Khách tối đa', type: 'number', min: 1, max: 50 },
    { key: 'bedrooms', label: 'Phòng ngủ', type: 'number', min: 0, max: 50 },
    { key: 'beds', label: 'Giường', type: 'number', min: 0, max: 100 },
    { key: 'bathrooms', label: 'Phòng tắm', type: 'number', min: 0, max: 50 },
  ];
  protected readonly prices: EditorField[] = [
    {
      key: 'weekday',
      label: 'Thứ Hai – Thứ Năm',
      type: 'number',
      min: 1000,
      max: 2000000000,
      required: true,
      hint: '₫ / đêm',
    },
    {
      key: 'weekend',
      label: 'Thứ Sáu – Chủ Nhật',
      type: 'number',
      min: 1000,
      max: 2000000000,
      required: true,
      hint: '₫ / đêm',
    },
    {
      key: 'holiday',
      label: 'Ngày lễ',
      type: 'number',
      min: 1000,
      max: 2000000000,
      required: true,
      hint: '₫ / đêm',
    },
  ];
  protected readonly extendedPrices: EditorField[] = [
    {
      key: 'weekly',
      label: 'Gói 7 đêm (₫)',
      type: 'number',
      min: 0,
      max: 2000000000,
      hint: 'Để 0 nếu không áp dụng. Đêm lễ cộng phần chênh lệch giá.',
    },
    {
      key: 'monthly',
      label: 'Gói 30 đêm (₫)',
      type: 'number',
      min: 0,
      max: 2000000000,
      hint: 'Để 0 nếu không áp dụng.',
    },
    {
      key: 'longStayDiscounts',
      label: 'Giảm giá ở dài ngày',
      type: 'textarea',
      wide: true,
      placeholder: '3 | 5\n7 | 15',
      hint: 'Mỗi dòng: số đêm | % giảm. Khách được mức cao nhất đủ điều kiện, trừ đêm lễ.',
    },
  ];
  protected readonly amenities: EditorField[] = [
    {
      key: 'keyFacilities',
      label: 'Tiện nghi nổi bật',
      type: 'textarea',
      placeholder: 'Ban công\nBếp riêng',
      hint: 'Mỗi dòng một tiện nghi, tối đa 12 mục.',
    },
    {
      key: 'facilities',
      label: 'Tất cả tiện nghi',
      type: 'textarea',
      placeholder: 'Wi-Fi miễn phí\nMáy giặt',
      hint: 'Mỗi dòng một tiện nghi.',
    },
    {
      key: 'rules',
      label: 'Nội quy căn hộ',
      type: 'textarea',
      placeholder: 'Không hút thuốc trong phòng',
      hint: 'Mỗi dòng một nội quy.',
    },
    {
      key: 'nearby',
      label: 'Địa điểm lân cận',
      type: 'textarea',
      placeholder: 'Hồ Xuân Hương | 10 phút đi xe',
      hint: 'Mỗi dòng: địa điểm | khoảng cách hoặc thời gian.',
    },
  ];
  protected readonly stay: EditorField[] = [
    { key: 'checkIn', label: 'Nhận phòng từ', type: 'time', required: true },
    { key: 'checkOut', label: 'Trả phòng trước', type: 'time', required: true },
    { key: 'depositPercent', label: 'Tiền đặt cọc (%)', type: 'number', min: 0, max: 100 },
    {
      key: 'sortOrder',
      label: 'Thứ tự hiển thị',
      type: 'number',
      min: 0,
      max: 10000,
      hint: 'Số nhỏ nhất là căn hộ nổi bật trên trang chủ.',
    },
    {
      key: 'slug',
      label: 'Đường dẫn căn hộ',
      required: true,
      maxLength: 100,
      wide: true,
      placeholder: 'sun-garden-da-lat',
      hint: 'Tự tạo từ tên căn hộ. Chỉ dùng chữ thường, số và dấu gạch ngang.',
    },
    {
      key: 'inspectionChecklist',
      label: 'Danh sách kiểm tra trả phòng',
      type: 'textarea',
      rows: 7,
      wide: true,
      placeholder: 'Phòng khách\n- Điều khiển TV\n- Đèn',
      hint: 'Mỗi phòng một dòng, vật dụng bắt đầu bằng dấu -. Để trống để dùng danh sách mặc định.',
    },
  ];

  constructor() {
    this.saved.set(this.router.currentNavigation()?.extras.state?.['apartmentSaved'] === true);
    this.destroyRef.onDestroy(() => {
      this.alive = false;
      this.uploads().forEach((upload) => URL.revokeObjectURL(upload.preview));
    });
    effect(() => {
      const slug = this.slug();
      if (slug) void this.load(slug);
    });
  }

  private async load(slug: string): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const apartment = await this.api.apartment(slug);
      this.shownDefault = apartment.inspectionChecklist.length
        ? undefined
        : formatChecklist(apartment.defaultInspectionChecklist);
      this.form.set(toForm(apartment));
    } catch (error) {
      this.loadFailed.set(true);
      this.error.set(toApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected text(field: keyof ApartmentForm, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    if (field === 'slug') this.slugEdited = true;
    this.form.update((form) => ({
      ...form,
      [field]: value,
      ...(field === 'name' && !this.slug() && !this.slugEdited
        ? {
            slug: value
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/đ/g, 'd')
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
              .slice(0, 100)
              .replace(/-$/, ''),
          }
        : {}),
    }));
    this.clearFieldError(field);
    this.changed.set(true);
    this.saved.set(false);
  }

  protected number(field: keyof ApartmentForm, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw === '' ? NaN : Number(raw);
    this.form.update((form) => ({ ...form, [field]: value }));
    this.clearFieldError(field);
    this.changed.set(true);
    this.saved.set(false);
  }

  protected toggleActive(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.form.update((form) => ({ ...form, isActive: checked }));
    this.changed.set(true);
    this.saved.set(false);
  }

  protected async save(): Promise<void> {
    if (this.saving() || this.uploading() || this.loading() || this.loadFailed()) return;
    if (!this.validate()) return;
    this.saving.set(true);
    this.error.set(undefined);
    try {
      const input = fromForm(this.form(), this.shownDefault);
      const current = this.slug();
      let saved: AdminApartment;
      if (current) saved = await this.api.updateApartment(current, input);
      else saved = await this.api.createApartment(input);

      if (!this.alive) return;
      this.changed.set(false);
      this.saved.set(true);
      this.publicApartments.reload();
      if (saved.slug !== current)
        void this.router.navigate(['/admin/apartments', saved.slug], {
          replaceUrl: true,
          state: { apartmentSaved: true },
        });
    } catch (error) {
      const apiError = toApiError(error);
      this.error.set(apiError);
      const errors: Record<string, string> = {};
      for (const detail of apiError.details ?? []) {
        const path = detail.path.replace(/^pricing\./, '');
        const key = /^photos\.\d+\.alt$/.test(path) ? path : path.split('.')[0];
        errors[key] ??= detail.message;
      }
      this.fieldErrors.set(errors);
      this.focusError();
    } finally {
      this.saving.set(false);
    }
  }

  /** Router leave guard; section links on this record do not invoke it. */
  confirmLeave(): boolean | Promise<boolean> {
    if (this.saving()) return false;
    if (!this.changed() && !this.uploading()) return true;
    this.leavePrompt.set(true);
    setTimeout(() => document.getElementById('leave-heading')?.focus());
    return new Promise((resolve) => {
      this.leaveDecision = resolve;
    });
  }

  protected answerLeave(allow: boolean): void {
    this.leavePrompt.set(false);
    this.leaveDecision?.(allow);
    this.leaveDecision = undefined;
    if (!allow) document.getElementById('apt-name')?.focus();
  }

  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (this.changed() || this.uploading()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  protected valueFor(field: EditorField): string | number {
    return this.form()[field.key];
  }

  protected retryLoad(): void {
    if (this.slug()) void this.load(this.slug()!);
  }

  protected imageUrl(src: string): string {
    return photoUrl(src, this.apiUrl);
  }

  protected errorFor(key: string): string | undefined {
    return this.fieldErrors()[key];
  }

  private clearFieldError(key: string): void {
    this.fieldErrors.update((errors) => {
      const next = { ...errors };
      delete next[key];
      return next;
    });
  }

  protected selectPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.addPhotos(Array.from(input.files ?? []));
    input.value = '';
  }

  protected dropPhotos(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    void this.addPhotos(Array.from(event.dataTransfer?.files ?? []));
  }

  private async addPhotos(files: File[]): Promise<void> {
    if (this.saving() || this.uploading() || !files.length) return;
    this.photoNotice.set('');
    const remaining = 60 - this.form().photos.length - this.uploads().length;
    if (files.length > remaining)
      this.photoNotice.set('Tối đa 60 ảnh. Chỉ thêm số ảnh còn cho phép.');
    const uploads = files.slice(0, Math.max(0, remaining)).map((file): PhotoUpload => ({
      id: ++this.nextUploadId,
      file,
      preview: URL.createObjectURL(file),
      status: 'uploading',
    }));
    this.uploads.update((current) => [...current, ...uploads]);
    for (const upload of uploads) {
      if (!this.alive) break;
      await this.uploadPhoto(upload);
    }
  }

  protected async retryPhoto(upload: PhotoUpload): Promise<void> {
    if (this.saving() || this.uploading()) return;
    this.uploads.update((files) =>
      files.map((file) =>
        file.id === upload.id ? { ...file, status: 'uploading', error: undefined } : file,
      ),
    );
    await this.uploadPhoto(upload);
  }

  private async uploadPhoto(upload: PhotoUpload): Promise<void> {
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(upload.file.type))
        throw new Error('Chọn ảnh JPG, PNG hoặc WebP.');
      if (!upload.file.size || upload.file.size > 5 * 1024 * 1024)
        throw new Error('Chọn ảnh có dung lượng từ 1 byte đến 5 MB.');
      const photo = await this.api.uploadApartmentPhoto(upload.file);
      if (!this.alive) return;
      const alt =
        upload.file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]/g, ' ')
          .trim()
          .slice(0, 250) || 'Ảnh căn hộ';
      this.form.update((form) => ({ ...form, photos: [...form.photos, { src: photo.src, alt }] }));
      this.dismissUpload(upload.id);
      this.clearFieldError('photos');
      this.changed.set(true);
      this.saved.set(false);
      this.photoNotice.set('Đã tải ảnh lên. Bạn có thể sửa mô tả và chọn ảnh bìa.');
    } catch (error) {
      if (!this.alive) return;
      const message =
        error instanceof Error && !(error instanceof HttpErrorResponse)
          ? error.message
          : toApiError(error).message;
      this.uploads.update((files) =>
        files.map((file) =>
          file.id === upload.id ? { ...file, status: 'error', error: message } : file,
        ),
      );
    }
  }

  protected dismissUpload(id: number): void {
    const upload = this.uploads().find((file) => file.id === id);
    if (upload) URL.revokeObjectURL(upload.preview);
    this.uploads.update((files) => files.filter((file) => file.id !== id));
  }

  private clearPhotoErrors(): void {
    this.fieldErrors.update((errors) =>
      Object.fromEntries(Object.entries(errors).filter(([key]) => !key.startsWith('photos.'))),
    );
  }

  protected photoAlt(index: number, event: Event): void {
    const alt = (event.target as HTMLInputElement).value;
    this.form.update((form) => ({
      ...form,
      photos: form.photos.map((photo, i) => (i === index ? { ...photo, alt } : photo)),
    }));
    this.clearFieldError(`photos.${index}.alt`);
    this.changed.set(true);
    this.saved.set(false);
  }

  protected movePhoto(index: number, destination: number): void {
    this.form.update((form) => {
      const photos = [...form.photos];
      const [photo] = photos.splice(index, 1);
      photos.splice(destination, 0, photo);
      return { ...form, photos };
    });
    this.clearPhotoErrors();
    this.changed.set(true);
    this.saved.set(false);
    this.photoNotice.set(destination === 0 ? 'Đã đổi ảnh bìa.' : 'Đã đổi thứ tự ảnh.');
  }

  protected removePhoto(index: number): void {
    this.form.update((form) => ({ ...form, photos: form.photos.filter((_, i) => i !== index) }));
    this.clearPhotoErrors();
    this.changed.set(true);
    this.saved.set(false);
    this.photoNotice.set('Đã gỡ ảnh khỏi căn hộ. Lưu thay đổi để cập nhật website.');
  }

  private validate(): boolean {
    const errors: Record<string, string> = {};
    const form = this.form();
    for (const field of [
      ...this.information,
      ...this.capacity,
      ...this.prices,
      ...this.extendedPrices,
      ...this.amenities,
      ...this.stay,
    ]) {
      const value = form[field.key];
      if (field.required && !String(value).trim())
        errors[field.key] = `Vui lòng nhập ${field.label.toLowerCase()}.`;
      if (
        typeof value === 'number' &&
        (!Number.isInteger(value) || value < (field.min ?? 0) || value > (field.max ?? Infinity))
      ) {
        errors[field.key] =
          `Nhập số nguyên từ ${new Intl.NumberFormat('vi-VN').format(field.min ?? 0)} đến ${new Intl.NumberFormat('vi-VN').format(field.max ?? 2000000000)}.`;
      }
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug))
      errors['slug'] = 'Chỉ dùng chữ thường, số và dấu gạch ngang.';
    if (!form.photos.length) errors['photos'] = 'Thêm ít nhất một ảnh căn hộ trước khi lưu.';
    form.photos.forEach((photo, index) => {
      if (!photo.alt.trim()) errors[`photos.${index}.alt`] = 'Thêm mô tả ngắn cho ảnh này.';
    });
    this.fieldErrors.set(errors);
    if (Object.keys(errors).length) {
      this.error.set({
        code: 'VALIDATION_ERROR',
        message: 'Kiểm tra các mục được đánh dấu trước khi lưu.',
      });
      this.focusError();
      return false;
    }
    return true;
  }

  private focusError(): void {
    setTimeout(() => {
      if (!this.alive) return;
      const target =
        document.querySelector<HTMLElement>('.apartment-editor [aria-invalid="true"]') ??
        document.getElementById('editor-error');
      const details = target?.closest('details');
      if (details) details.open = true;
      target?.focus();
      target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  }
}
