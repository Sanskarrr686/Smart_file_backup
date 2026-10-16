// Replaces placeholder seed passwords (hash_divya_123 ...) with a real bcrypt hash.
// Usage: node scripts/seed_passwords.js [password]   (default demo password: Password@123)
// Only touches users whose password_hash is NOT already bcrypt, so real accounts are never changed.
require("dotenv").config();
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
(async () => {
    const pw = process.argv[2] || "Password@123";
    const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: process.env.DB_PORT });
    const [r] = await db.query("UPDATE users SET password_hash = ? WHERE password_hash NOT LIKE '$2%'", [await bcrypt.hash(pw, 10)]);
    console.log(`hashed ${r.affectedRows} user(s). Demo password = ${pw}`);
    await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
