import { useEffect, useState } from "react";
import { checkHealth, optimizeQuery } from "./api/api";

function App() {
  const [dbStatus, setDbStatus] = useState<string>("⏳ Đang kiểm tra kết nối...");
  const [sql, setSql] = useState<string>("SELECT * FROM users");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    checkHealth()
      .then((data) => setDbStatus(` ${data.message} (${data.dbTime})`))
      .catch(() => setDbStatus("Không thể kết nối Backend/PostgreSQL"));
  }, []);

  const handleOptimize = async () => {
    setLoading(true);
    try {
      const res = await optimizeQuery(sql);
      setResult(res.data);
    } catch (err: any) {
      alert("Lỗi khi kết nối API!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "30px", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <h2>Big Data SQL Optimizer - Test Connection</h2>
      <div style={{ padding: "10px", background: "#f0f0f0", borderRadius: "5px" }}>
        <strong>Trạng thái kết nối:</strong> {dbStatus}
      </div>

      <div style={{ marginTop: "20px" }}>
        <label><strong>Nhập truy vấn SQL cần tối ưu:</strong></label>
        <textarea
          rows={5}
          style={{ width: "100%", marginTop: "8px", padding: "10px", fontSize: "14px" }}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
        />
        <button
          onClick={handleOptimize}
          disabled={loading}
          style={{ marginTop: "10px", padding: "10px 20px", background: "#007bff", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
        >
          {loading ? "Đang xử lý..." : "⚡ Tối ưu SQL"}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: "25px", border: "1px solid #ccc", padding: "15px", borderRadius: "5px" }}>
          <h3 style={{ color: "#28a745" }}>Kết quả từ Core Engine:</h3>
          <p><strong>Điểm nghẽn phát hiện:</strong></p>
          <ul>
            {result.bottlenecks?.map((b: string, i: number) => <li key={i}>{b}</li>)}
          </ul>
          <p><strong>Khuyến nghị:</strong></p>
          <ul>
            {result.recommendations?.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
          <p><strong>SQL Đề xuất:</strong> <code>{result.suggestedQuery}</code></p>
        </div>
      )}
    </div>
  );
}

export default App;
