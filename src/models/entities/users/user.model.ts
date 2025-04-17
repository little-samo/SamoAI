export interface UserModel {
  id: number;

  username: string | null;
  nickname: string;
  firstName: string | null;
  lastName: string | null;

  meta: unknown;
}
