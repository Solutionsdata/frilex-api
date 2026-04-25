const multer = require('multer');
const { getStorage } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const ALLOWED_MIME_TYPES = {
  document: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
};

const memoryStorage = multer.memoryStorage();

const fileFilter = (allowedTypes) => (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de arquivo não permitido. Permitidos: ${allowedTypes.join(', ')}`), false);
  }
};

const uploadDocument = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: fileFilter(ALLOWED_MIME_TYPES.document),
});

const uploadImage = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter(ALLOWED_MIME_TYPES.image),
});

const uploadToFirebase = async (file, folder) => {
  const bucket = getStorage().bucket();
  const ext = path.extname(file.originalname);
  const filename = `${folder}/${uuidv4()}${ext}`;
  const fileRef = bucket.file(filename);

  await fileRef.save(file.buffer, {
    metadata: {
      contentType: file.mimetype,
      metadata: { originalName: file.originalname },
    },
  });

  await fileRef.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${filename}`;
};

module.exports = { uploadDocument, uploadImage, uploadToFirebase };
