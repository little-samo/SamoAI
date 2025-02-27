export interface UserModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  username: string | null;
  nickname: string;
  firstName: string | null;
  lastName: string | null;

  meta: unknown;
}
