import 'ranu/server-only';

export const db = {
  connectionString: process.env.DATABASE_URL,
  async query(sql: string) {
    return [{ id: 1, name: 'Sample' }];
  },
};
