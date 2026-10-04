export const config = {
  dataDir: process.env.ATLAS_DATA_DIR ?? "./data",
  port: Number(process.env.ATLAS_PORT ?? 8420),
};
