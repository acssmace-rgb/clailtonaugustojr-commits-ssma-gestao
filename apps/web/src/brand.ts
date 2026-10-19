export interface Brand {
  name: string;
  productName: string;
  tagline: string;
  logos: { darkBackground: string; lightBackground: string; fullDarkBackground: string; symbol: string };
  colors: { primary: string; dark: string; neutral: string };
  fonts: { heading: string; body: string; headingFile: string | null; bodyFile: string | null };
}

/** Interface neutra usada apenas se /brand/brand.json não puder ser carregado. */
export const NEUTRAL_BRAND: Brand = {
  name: 'Gestão SSMA',
  productName: 'Gestão SSMA',
  tagline: '',
  logos: { darkBackground: '', lightBackground: '', fullDarkBackground: '', symbol: '' },
  colors: { primary: '#9aa09c', dark: '#2f3331', neutral: '#c4c7c5' },
  fonts: { heading: 'system-ui', body: 'system-ui', headingFile: null, bodyFile: null },
};

export async function loadBrand(): Promise<Brand> {
  let brand = NEUTRAL_BRAND;
  try {
    const res = await fetch('/brand/brand.json', { cache: 'no-cache' });
    if (res.ok) brand = { ...NEUTRAL_BRAND, ...(await res.json()) };
  } catch {
    /* mantém interface neutra */
  }
  const root = document.documentElement.style;
  root.setProperty('--brand-primary', brand.colors.primary);
  root.setProperty('--brand-dark', brand.colors.dark);
  root.setProperty('--brand-neutral', brand.colors.neutral);
  const fontFaces: string[] = [];
  if (brand.fonts.headingFile) fontFaces.push(`@font-face{font-family:'${brand.fonts.heading}';src:url('${brand.fonts.headingFile}');font-display:swap}`);
  if (brand.fonts.bodyFile) fontFaces.push(`@font-face{font-family:'${brand.fonts.body}';src:url('${brand.fonts.bodyFile}');font-display:swap}`);
  if (fontFaces.length) {
    const style = document.createElement('style');
    style.textContent = fontFaces.join('\n');
    document.head.appendChild(style);
  }
  root.setProperty('--font-heading', `'${brand.fonts.heading}', 'Century Gothic', 'Segoe UI', system-ui, sans-serif`);
  root.setProperty('--font-body', `'${brand.fonts.body}', 'Segoe UI', 'Helvetica Neue', Arial, system-ui, sans-serif`);
  document.title = brand.productName;
  return brand;
}
