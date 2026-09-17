import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({
        success: true,
        message: "API đang chạy",
    });
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
});