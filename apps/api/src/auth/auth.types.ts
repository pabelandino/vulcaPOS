export type AuthUser = {
  sub: number;
  username: string;
  name: string;
  role: 'ADMIN' | 'CASHIER';
  branchId: number | null;
  access?: string[];
};
