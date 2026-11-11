export function pageArgs(input: { page?: string; pageSize?: string }) {
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(input.pageSize) || 10));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pageOf<T>(items: T[], total: number, page: number, pageSize: number, extra: Record<string, unknown> = {}) {
  return {
    items,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    ...extra,
  };
}
