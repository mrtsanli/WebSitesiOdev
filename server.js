require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path'); // path modülünü ekleyin

const app = express();
const port = process.env.PORT || 3000;

// MySQL bağlantısı
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Veritabanı bağlantısını kontrol et
db.connect(err => {
    if (err) throw err;
    console.log('MySQL Connected...');
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true })); // URL-encoded verileri ayrıştırmak için
app.use(bodyParser.json()); // JSON verileri ayrıştırmak için
app.use(express.static('public')); // Statik dosyalar için
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true
}));

// Kayıt sayfası
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

// Giriş sayfası
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Kayıt olma işlemi
app.post('/register', (req, res) => {
    console.log(req.body); // Gelen verileri kontrol et
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send('Kullanıcı adı ve şifre gereklidir.');
    }

    const hashedPassword = bcrypt.hashSync(password, 10); // Şifreyi hashle

    db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err, result) => {
        if (err) {
            return res.status(500).send('Kayıt işlemi başarısız.');
        }
        res.redirect('/login'); // Kayıt başarılıysa giriş sayfasına yönlendir
    });
});

// Giriş işlemi
app.post('/login', (req, res) => {
    console.log(req.body); // Gelen verileri kontrol et
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send('Kullanıcı adı ve şifre gereklidir.');
    }

    db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).send('Kullanıcı bulunamadı.');
        }

        const user = results[0];
        if (bcrypt.compareSync(password, user.password)) {
            req.session.userId = user.id; // Oturum aç
            req.session.username = user.username; // Kullanıcı adını oturumda sakla
            res.redirect('/'); // Ana sayfaya yönlendir
        } else {
            res.status(401).send('Şifre yanlış.');
        }
    });
});

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Çıkış işlemi
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/'); // Hata durumunda ana sayfaya yönlendir
        }
        // Kullanıcı çıkış yaptıktan sonra index.html sayfasında kal
        res.redirect('/'); // Ana sayfaya yönlendir
    });
});

// Kullanıcı bilgilerini döndüren API endpoint
app.get('/api/user', (req, res) => {
    if (req.session.username) {
        res.json({ username: req.session.username });
    } else {
        res.json({ username: null });
    }
});

// Yorumları döndüren API endpoint
app.get('/api/comments', (req, res) => {
    db.query(`
        SELECT comments.id, comments.content, comments.created_at, users.username, 
        (SELECT COUNT(*) FROM likes WHERE comment_id = comments.id) AS like_count 
        FROM comments 
        JOIN users ON comments.user_id = users.id 
        ORDER BY comments.created_at DESC`, (err, results) => {
        if (err) {
            return res.status(500).send('Yorumlar alınırken bir hata oluştu.');
        }
        res.json(results);
    });
});

// Yorum yapma işlemi
app.post('/api/comments', (req, res) => {
    const { content } = req.body;
    const userId = req.session.userId; // Oturumdan kullanıcı ID'sini al

    if (!userId || !content) {
        return res.status(400).send('Kullanıcı ID\'si ve içerik gereklidir.');
    }

    db.query('INSERT INTO comments (user_id, content) VALUES (?, ?)', [userId, content], (err, result) => {
        if (err) {
            return res.status(500).send('Yorum eklenirken bir hata oluştu.');
        }
        res.status(201).send({ id: result.insertId, content, userId });
    });
});

// Yanıt verme işlemi
app.post('/api/replies', (req, res) => {
    const { commentId, content } = req.body;
    const userId = req.session.userId; // Oturumdan kullanıcı ID'sini al

    if (!userId || !commentId || !content) {
        return res.status(400).send('Kullanıcı ID\'si, yorum ID\'si ve içerik gereklidir.');
    }

    db.query('INSERT INTO replies (comment_id, user_id, content) VALUES (?, ?, ?)', [commentId, userId, content], (err, result) => {
        if (err) {
            return res.status(500).send('Yanıt eklenirken bir hata oluştu.');
        }
        res.status(201).send({ id: result.insertId, content, userId });
    });
});

// Beğeni ekleme işlemi
app.post('/api/likes', (req, res) => {
    const { commentId } = req.body;
    const userId = req.session.userId; // Oturumdan kullanıcı ID'sini al

    if (!userId || !commentId) {
        return res.status(400).send('Kullanıcı ID\'si ve yorum ID\'si gereklidir.');
    }

    db.query('INSERT INTO likes (comment_id, user_id) VALUES (?, ?)', [commentId, userId], (err, result) => {
        if (err) {
            return res.status(500).send('Beğeni eklenirken bir hata oluştu.');
        }
        res.status(201).send({ commentId, userId });
    });
});

// Beğeni ekleme veya kaldırma işlemi
app.post('/api/likes', (req, res) => {
    const { commentId } = req.body;
    const userId = req.session.userId; // Oturumdan kullanıcı ID'sini al

    if (!userId || !commentId) {
        
        return res.status(400).send('Kullanıcı ID\'si ve yorum ID\'si gereklidir.');
    }

    // Kullanıcının daha önce bu yorumu beğenip beğenmediğini kontrol et
    db.query('SELECT * FROM likes WHERE comment_id = ? AND user_id = ?', [commentId, userId], (err, results) => {
        if (err) {
            return res.status(500).send('Beğeni kontrolü sırasında bir hata oluştu.');
        }

        if (results.length > 0) {
            // Kullanıcı daha önce beğenmiş, beğeniyi kaldır
            db.query('DELETE FROM likes WHERE comment_id = ? AND user_id = ?', [commentId, userId], (err) => {
                if (err) {
                    return res.status(500).send('Beğeni kaldırılırken bir hata oluştu.');
                }
                return res.status(200).send({ message: 'Beğeni kaldırıldı.' });
            });
        } else {
            // Beğeni ekle
            db.query('INSERT INTO likes (comment_id, user_id) VALUES (?, ?)', [commentId, userId], (err) => {
                if (err) {
                    return res.status(500).send('Beğeni eklenirken bir hata oluştu.');
                }
                return res.status(201).send({ message: 'Beğeni eklendi.' });
            });
        }
    });
});

// Yanıt verme işlemi
app.post('/api/replies', (req, res) => {
    const { commentId, content } = req.body;
    const userId = req.session.userId; // Oturumdan kullanıcı ID'sini al

    if (!userId || !commentId || !content) {
        return res.status(400).send('Kullanıcı ID\'si, yorum ID\'si ve içerik gereklidir.');
    }

    db.query('INSERT INTO replies (comment_id, user_id, content) VALUES (?, ?, ?)', [commentId, userId, content], (err, result) => {
        if (err) {
            return res.status(500).send('Yanıt eklenirken bir hata oluştu.');
        }
        res.status(201).send({ id: result.insertId, content, userId });
    });
});

// Yorumları döndüren API endpoint
app.get('/api/comments', (req, res) => {
    db.query(`
        SELECT comments.id, comments.content, comments.created_at, users.username, 
        (SELECT COUNT(*) FROM likes WHERE comment_id = comments.id) AS like_count 
        FROM comments 
        JOIN users ON comments.user_id = users.id 
        ORDER BY comments.created_at DESC`, (err, results) => {
        if (err) {
            return res.status(500).send('Yorumlar alınırken bir hata oluştu.');
        }

        // Her yorum için yanıtları al
        const commentsWithReplies = results.map(comment => {
            return new Promise((resolve, reject) => {
                db.query('SELECT replies.content, users.username FROM replies JOIN users ON replies.user_id = users.id WHERE comment_id = ?', [comment.id], (err, replies) => {
                    if (err) return reject(err);
                    comment.replies = replies; // Yanıtları ekle
                    resolve(comment);
                });
            });
        });

        Promise.all(commentsWithReplies)
            .then(comments => res.json(comments))
            .catch(err => res.status(500).send('Yanıtlar alınırken bir hata oluştu.'));
    });
});

// Sunucuyu başlat
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});