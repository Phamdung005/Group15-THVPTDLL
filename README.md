# 🚀 Big Data SQL Optimizer

Hệ thống hỗ trợ phân tích, phát hiện điểm nghẽn và tự động đề xuất phương án tối ưu truy vấn SQL trên dữ liệu lớn (Big Data SQL Optimization System).

---

## 📌 1. Tổng quan Dự án (Project Overview)

**Big Data SQL Optimizer** được thiết kế nhằm mục đích mô phỏng và thực thi quy trình tối ưu hóa câu lệnh SQL trên các tập dữ liệu dung lượng lớn (hàng triệu tới hàng chục triệu bản ghi) ngay tại môi trường local mà **không phụ thuộc vào AI API bên ngoài**.

### 🔄 Luồng xử lý chính (Core Pipeline):
```text
  [Input SQL Query]
          │
          ▼
   1. Analyze & Parse (Phân tích cú pháp & Execution Plan EXPLAIN ANALYZE)
          │
          ▼
   2. Detect Bottlenecks (Phát hiện điểm nghẽn hiệu năng: Sequential Scan, High Cost Join, Missing Index, etc.)
          │
          ▼
   3. Generate Candidates (Sinh ra các câu SQL ứng viên dựa trên Rule-based Optimization Engine)
          │
          ▼
   4. Benchmark Engine (Chạy thực tế các câu truy vấn và đo lường chỉ số performance)
          │
          ▼
   5. Compare & Select (So sánh Execution Time, Cost, Buffer Reads, Rows Processed và chọn phương án tối ưu)
          │
          ▼
   6. Display Result (Hiển thị Dashboard so sánh Trước vs Sau khi tối ưu)
```

---

## 📁 2. Cấu trúc Dự án (Project Structure)

Dự án được tổ chức theo kiến trúc Monorepo phân tách rõ ràng giữa Frontend, Backend, Optimization Services và Infrastructure:

```text
big-data-sql-optimizer/
├── 📂 apps/                       # Chứa các ứng dụng người dùng chính
│   ├── 📂 backend/                # Node.js + Express + TypeScript API Server (Port 3000)
│   │   ├── 📂 src/
│   │   │   └── server.ts          # Entry point của Backend API
│   │   ├── package.json           # Dependencies: express, pg, cors, dotenv, tsx
│   │   └── tsconfig.json          # Cấu hình TypeScript Backend
│   └── 📂 frontend/               # React 19 + TypeScript + Vite Dashboard (Port 5173)
│       ├── 📂 src/
│       │   ├── App.tsx            # Giao diện chính của Dashboard
│       │   ├── main.tsx           # Entry point React Vite
│       │   ├── index.css          # Styling & CSS variables
│       │   └── App.css
│       ├── package.json           # Dependencies: react, antd, @monaco-editor/react, recharts
│       └── vite.config.ts         # Cấu hình Vite Dev Server
│
├── 📂 services/                   # Các dịch vụ cốt lõi của Engine Tối ưu hóa SQL
│   └── 📂 optimizer/              # Engine phân tích & tối ưu SQL (Rule-Based)
│       ├── 📂 parser/             # Phân tích cú pháp câu lệnh SQL (SQL AST / Clause Parser)
│       ├── 📂 analyzer/           # Phân tích Execution Plan & Query Cost từ PostgreSQL EXPLAIN
│       ├── 📂 rules/              # Các quy tắc tối ưu hóa (Index Pushdown, Join Reordering, Subquery to CTE, etc.)
│       ├── 📂 recommendation/     # Bộ tạo gợi ý & khuyến nghị chỉ mục (Index Recommendations)
│       ├── 📂 benchmark/          # Engine thực thi & đo đạc thông số Benchmark thực tế
│       └── 📂 optimizer/          # Core Generator tạo candidate queries & lựa chọn phương án tối ưu
│
├── 📂 infrastructure/             # Hạ tầng và cấu hình môi trường
│   ├── 📂 postgres/               # Cấu hình & Kịch bản khởi tạo database PostgreSQL
│   └── 📂 spark/                  # Tích hợp Apache Spark mô phỏng xử lý dữ liệu lớn trên Local
│
├── 📂 data/                       # Quản lý dữ liệu & Sinh dữ liệu thử nghiệm
│   ├── 📂 generator/              # Script Python sinh dữ liệu giả lập quy mô lớn
│   │   ├── generate.py            # Python script tạo dữ liệu ngẫu nhiên (Faker, Pandas, PyArrow)
│   │   └── requirements.txt       # Thư viện Python: faker, pandas, pyarrow
│   └── 📂 datasets/               # Thư mục chứa tập dữ liệu mẫu (CSV, Parquet)
│
├── 📄 docker-compose.yml          # Container PostgreSQL 16 (Port 5432)
└── 📄 README.md                   # Tài liệu hướng dẫn phát triển dự án
```

---

## 🛠️ 3. Yêu cầu Môi trường (Prerequisites)

Trước khi bắt đầu, máy dev cần cài đặt sẵn các công cụ sau:

- **Node.js**: phiên bản `>= 18.x` hoặc `>= 20.x`
- **npm**: phiên bản `>= 9.x`
- **Python**: phiên bản `>= 3.10` (dùng cho công cụ sinh data giả lập)
- **Docker & Docker Compose**: Để chạy PostgreSQL 16 container
- **Git**: Quản lý mã nguồn

---

## 🚀 4. Hướng dẫn Chạy Dự án (Quick Start for Developers)

Dưới đây là quy trình 5 bước để một Developer mới clone dự án và chạy hoàn chỉnh từ A-Z.

### 📥 Bước 1: Clone Repository
```bash
git clone https://github.com/Phamdung005/Group15-THVPTDLL.git
cd big-data-sql-optimizer
```

---

### 🐳 Bước 2: Khởi chạy Database (PostgreSQL 16)
Sử dụng Docker Compose để khởi chạy cơ sở dữ liệu PostgreSQL local:

```bash
docker-compose up -d
```
> **Thông số kết nối Database mặc định:**
> - **Host**: `localhost`
> - **Port**: `5432`
> - **Database**: `bigdata_optimizer`
> - **Username**: `postgres`
> - **Password**: `postgres`

Kiểm tra trạng thái container:
```bash
docker-compose ps
```

---

### 📊 Bước 3: Sinh dữ liệu thử nghiệm (Data Generator)
Chạy script Python để sinh tập dữ liệu lớn thử nghiệm vào `data/datasets`:

```bash
# Di chuyển vào thư mục generator
cd data/generator

# Tạo môi trường ảo Python (tùy chọn nhưng khuyến nghị)
python -m venv .venv

# Kích hoạt venv (Windows PowerShell)
.\.venv\Scripts\Activate.ps1
# Hoặc Linux/macOS: source .venv/bin/activate

# Cài đặt thư viện phụ thuộc
pip install -r requirements.txt

# Chạy script sinh dữ liệu
python generate.py

# Quay trở lại thư mục gốc dự án
cd ../..
```

---

### ⚡ Bước 4: Khởi chạy Backend API Server
Cài đặt phụ thuộc và khởi chạy Backend (Port `3000`):

```bash
# Di chuyển vào thư mục backend
cd apps/backend

# Cài đặt node_modules
npm install

# Khởi chạy ở chế độ Development (với hot-reload tsx)
npm run dev
```
Backend API sẽ chạy tại: **`http://localhost:3000`**  
Kiểm tra Health Check API: `http://localhost:3000/api/health`

---

### 🎨 Bước 5: Khởi chạy Frontend Dashboard
Mở một cửa sổ Terminal mới, cài đặt và khởi chạy Frontend (Port `5173`):

```bash
# Di chuyển vào thư mục frontend
cd apps/frontend

# Cài đặt node_modules
npm install

# Khởi chạy ứng dụng Frontend với Vite
npm run dev
```
Truy cập Dashboard trên trình duyệt tại: **`http://localhost:5173`**

---

## 🧩 5. Giải thích Kiến trúc & Mã nguồn (Codebase Deep Dive)

### 1. **`apps/backend` (REST API Server)**
- Sử dụng **Express** + **TypeScript** (`tsx` dev runner).
- Nhận yêu cầu phân tích/tối ưu truy vấn SQL từ Frontend Dashboard.
- Kết nối tới PostgreSQL bằng thư viện `pg` để thực thi `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.

### 2. **`services/optimizer` (Lõi Tối ưu SQL)**
- **`parser/`**: Phân tách câu SQL đầu vào thành cấu trúc AST/Clausal Token để dễ phân tích bảng, cột, điều kiện `WHERE`, `JOIN`, `GROUP BY`.
- **`analyzer/`**: Phân tích Execution Plan trả về từ PostgreSQL, nhận diện các nút đắt đỏ (Costly Nodes) như Sequential Scan trên bảng lớn, Nested Loop Join chi phí cao, Sort in Memory/Disk.
- **`rules/`**: Định nghĩa tập luật tối ưu hóa rule-based:
  - Chuyển `SELECT *` thành danh sách cột cụ thể.
  - Chuyển Subquery không tương quan thành CTE hoặc JOIN.
  - Đề xuất tạo Index thích hợp dựa trên các cột lọc trong `WHERE` / `JOIN`.
- **`benchmark/`**: Thực thi song song hoặc nối tiếp các câu SQL ứng viên (Original vs Candidates), đo đạc chính xác execution time, planning time, shared hit/read buffers.
- **`optimizer/`**: Tổng hợp kết quả và trả về câu SQL tối ưu tốt nhất kèm theo báo cáo chi tiết so sánh hiệu năng.

### 3. **`apps/frontend` (Giao diện Người dùng)**
- Xây dựng bằng **React 19**, **Vite**, **Ant Design**, **Monaco Editor** (`@monaco-editor/react`) và **Recharts**.
- Cho phép dev nhập SQL query, xem Execution Plan trực quan, bảng so sánh chỉ số trước/sau tối ưu và biểu đồ thời gian chạy.

---

## 📜 6. Các lệnh hữu ích (Useful Commands)

| Công việc | Vị trí thư mục | Lệnh thực thi |
| :--- | :--- | :--- |
| **Khởi động DB** | Thư mục gốc (`/`) | `docker-compose up -d` |
| **Dừng DB** | Thư mục gốc (`/`) | `docker-compose down` |
| **Chạy Backend Dev** | `apps/backend` | `npm run dev` |
| **Build Backend** | `apps/backend` | `npm run build` |
| **Chạy Frontend Dev** | `apps/frontend` | `npm run dev` |
| **Build Frontend** | `apps/frontend` | `npm run build` |
| **Sinh Data thử nghiệm** | `data/generator` | `python generate.py` |

---

## 🤝 7. Quy trình Đóng góp (Contribution Guide)

1. **Tạo nhánh (Branch)** từ `main`: `git checkout -b feature/ten-tinh-nang`
2. **Tuân thủ TypeScript**: Đảm bảo không có lỗi type check (`npm run build`).
3. **Commit chuẩn**: Đặt tên commit rõ ràng (e.g., `feat: add index recommendation rule`, `fix: handle subquery parsing`).
4. **Tạo Pull Request**: Mở PR tới nhánh `main` và mô tả các thay đổi.