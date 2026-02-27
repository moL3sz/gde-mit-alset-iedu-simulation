export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

// Placeholder for future Postgres/Redis adapters.
export const databaseAdapter: DatabaseAdapter = {
  connect(): Promise<void> {
    return Promise.resolve();
  },
  disconnect(): Promise<void> {
    return Promise.resolve();
  },
};
