/** "Chính Sách Intern" -> "chinh-sach-intern" (matches the backend rule ^[a-z0-9-]{1,64}$). */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // strip accents/diacritics (Vietnamese, French, …)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}
