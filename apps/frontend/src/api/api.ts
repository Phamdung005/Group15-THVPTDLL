import axios from "axios";

const API_URL = "http://localhost:3000/api";

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface DatabaseItem {
  name: string;
  totalRows: number;
  totalRowsFormatted: string;
  sizeFormatted: string;
  label: string;
  isCurrent: boolean;
}

export interface DatabaseOverview {
  database: string;
  host: string;
  port: number;
  engine: string;
  totalTables: number;
  totalRows: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  tables: Array<{
    name: string;
    rowCount: number;
    sizeFormatted: string;
  }>;
}

export const checkHealth = async () => {
  const res = await apiClient.get("/health");
  return res.data;
};

export const optimizeQuery = async (sql: string) => {
  const response = await apiClient.post("/optimize", { sql });
  return response.data;
};

export const getSamples = async () => {
  const response = await apiClient.get("/samples");
  return response.data;
};

export const getDatabaseInfo = async (): Promise<DatabaseOverview> => {
  const res = await apiClient.get("/database/info");
  return res.data.data;
};

export const getDatabaseList = async (): Promise<DatabaseItem[]> => {
  const res = await apiClient.get("/database/list");
  return res.data.data;
};

export const switchDatabase = async (databaseName: string) => {
  const res = await apiClient.post("/database/connect", {
    database: databaseName,
    action: "switch",
  });
  return res.data;
};

export const connectDatabase = async (config: {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  action?: "test" | "switch";
}) => {
  const res = await apiClient.post("/database/connect", config);
  return res.data;
};

export const uploadDatasetFile = async (
  file: File,
  tableName?: string,
  delimiter: string = ",",
  createNewDb: boolean = false,
  targetDbName?: string
) => {
  const formData = new FormData();
  formData.append("file", file);
  if (tableName) formData.append("tableName", tableName);
  formData.append("delimiter", delimiter);
  if (createNewDb) formData.append("createNewDb", "true");
  if (targetDbName) formData.append("targetDbName", targetDbName);

  const res = await axios.post(`${API_URL}/dataset/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const generateSyntheticDataset = async (scale: number) => {
  const res = await apiClient.post("/dataset/generate", { scale });
  return res.data;
};

export const applyCandidate = async (candidate: any) => {
  const res = await apiClient.post("/apply", { candidate });
  return res.data;
};

export const rollbackAction = async () => {
  const res = await apiClient.post("/rollback");
  return res.data;
};