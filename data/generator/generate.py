import psycopg2
import os
import time

print("[INFO] Dang ket noi toi PostgreSQL...")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_NAME = os.getenv("DB_NAME", "bigdata_optimizer")
conn = psycopg2.connect(
    host=DB_HOST,
    port=DB_PORT,
    dbname=DB_NAME,
    user=DB_USER,
    password=DB_PASSWORD
)
cursor = conn.cursor()

start_time = time.time()

print("[1/4] Dang khoi tao Schema Bang...")
cursor.execute("""
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100),
    created_at TIMESTAMP
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INT, -- Chua tao Index de gia lap Sequential Scan
    status VARCHAR(20),
    total_amount DECIMAL(10, 2),
    created_at TIMESTAMP
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT, -- Chua tao Index
    product_name VARCHAR(100),
    quantity INT,
    unit_price DECIMAL(10, 2)
);
""")
conn.commit()

print("[2/4] Dang sinh 50,000 Khach hang (Customers)...")
cursor.execute("""
INSERT INTO customers (name, email, created_at)
SELECT 
    'Customer_' || i,
    'user_' || i || '@example.com',
    NOW() - (random() * interval '730 days')
FROM generate_series(1, 50000) AS i;
""")
conn.commit()

print("[3/4] Dang sinh 200,000 Don hang (Orders)...")
cursor.execute("""
INSERT INTO orders (customer_id, status, total_amount, created_at)
SELECT 
    floor(random() * 50000 + 1)::int,
    (ARRAY['completed', 'pending', 'cancelled', 'processing'])[floor(random() * 4 + 1)::int],
    round((random() * 480 + 20)::numeric, 2),
    NOW() - (random() * interval '365 days')
FROM generate_series(1, 200000) AS i;
""")
conn.commit()

print("[4/4] Dang sinh 500,000 Chi tiet don hang (Order Items)...")
cursor.execute("""
INSERT INTO order_items (order_id, product_name, quantity, unit_price)
SELECT 
    floor(random() * 200000 + 1)::int,
    'Product_' || floor(random() * 1000 + 1)::int,
    floor(random() * 5 + 1)::int,
    round((random() * 95 + 5)::numeric, 2)
FROM generate_series(1, 500000) AS i;
""")
conn.commit()

cursor.close()
conn.close()

elapsed = time.time() - start_time
print(f"[SUCCESS] HOAN THANH! Da nap 750,000 dong du lieu thu nghiem vao PostgreSQL chi trong {elapsed:.2f} giay!")
