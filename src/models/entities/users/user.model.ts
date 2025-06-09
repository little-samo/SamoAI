export interface UserModel {
  id: string | number | bigint;

  username: string | null;
  nickname: string;
  firstName: string | null;
  lastName: string | null;

  meta: unknown;
}
