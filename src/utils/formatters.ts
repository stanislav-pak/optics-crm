// Форматирует номер в вид: +7 777 222 33 44
export function formatPhone(value: string): string {
  // Оставляем только цифры
  const digits = value.replace(/\D/g, '');

  // Если цифр нет — возвращаем пустую строку (позволяем очистить поле)
  if (!digits) return '';

  // Нормализуем: 8 или 7 в начале → 7
  const normalized = digits.startsWith('8')
    ? '7' + digits.slice(1)
    : digits.startsWith('7')
      ? digits
      : '7' + digits;

  const d = normalized.slice(0, 11);

  if (d.length <= 1) return '+' + d;
  if (d.length <= 4) return `+${d[0]} ${d.slice(1)}`;
  if (d.length <= 7) return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4)}`;
  if (d.length <= 9) return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
}
