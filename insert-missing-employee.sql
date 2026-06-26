
-- Ganti nilai di bawah ini dengan data employee yang sesuai!
-- ID Employee: 0a3c46fb-d5dc-4ed4-a2a5-fd32e6a5e9b3

INSERT INTO employees (
  id,
  nip,
  name,
  department,
  position_name,
  rank_group,
  created_at,
  updated_at
) VALUES (
  '0a3c46fb-d5dc-4ed4-a2a5-fd32e6a5e9b3', -- ID dari error message
  '1234567890', -- Ganti dengan NIP asli
  'Nama Pegawai', -- Ganti dengan nama asli
  'Departemen', -- Ganti dengan departemen asli
  'Jabatan', -- Ganti dengan jabatan asli
  'Golongan', -- Ganti dengan golongan asli
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  nip = EXCLUDED.nip,
  name = EXCLUDED.name,
  department = EXCLUDED.department,
  position_name = EXCLUDED.position_name,
  rank_group = EXCLUDED.rank_group,
  updated_at = NOW();

-- Untuk memastikan:
SELECT * FROM employees WHERE id = '0a3c46fb-d5dc-4ed4-a2a5-fd32e6a5e9b3';
