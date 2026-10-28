const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());

// หน้าแรกของระบบ: แสดงตัวตนของผู้ใช้งานที่ส่งมาจาก Mock Auth
app.get('/', (req, res) => {
    const userId = req.headers['x-user-id'] || 'Guest';
    const email = req.headers['x-user-email'] || 'Unknown';
    const role = req.headers['x-user-role'] || 'No Role';
    const dept = req.headers['x-user-department'] || 'General';

    res.send(`
        <div style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6;">
            <h2>🚀 ยินดีต้อนรับเข้าสู่ระบบงานภายใน</h2>
            <div style="background: #f4f6f8; border-left: 4px solid #0066cc; padding: 15px; margin-bottom: 20px;">
                <p><strong>รหัสพนักงาน (User ID):</strong> ${userId}</p>
                <p><strong>อีเมล (Email):</strong> ${email}</p>
                <p><strong>ตำแหน่ง/สิทธิ์ (Role):</strong> ${role}</p>
                <p><strong>แผนก (Department):</strong> ${dept}</p>
            </div>
            <p>✅ <em>สถานะ: เชื่อมต่อผ่าน IT Security Gateway เรียบร้อย</em></p>
            <p>💡 เริ่มต้นพัฒนา Business Flow และหน้าจอทำงานของแผนกได้ทันทีในโฟลเดอร์ <code>app/</code></p>
        </div>
    `);
});

// Endpoint ตัวอย่างสำหรับ API
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'dept-app' });
});

app.listen(port, () => {
    console.log(`Department App listening on port ${port}`);
});
