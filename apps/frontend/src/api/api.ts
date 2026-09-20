import axios from "axios";

const API_URL = "http://localhost:3000/api";

const apiClient = axios.create({
    baseURL: API_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

export const checkHealth = async () => {
    const res = await apiClient.get("/health");
    return res.data;
}

export const optimizeQuery = async (sql: string) => {
    const response = await apiClient.post("/optimize", { sql });
    return response.data;
};