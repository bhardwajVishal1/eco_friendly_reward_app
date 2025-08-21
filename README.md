
# GreenLoop MVP with Camera Upload Demo

This package contains an enhanced MVP of the GreenLoop eco-rewards app that demonstrates camera photo upload via a presign-like flow.

## Backend (uploads)
- POST /uploads/presign -> returns a demo upload URL and key
- PUT /uploads/upload?key=... -> upload file (multipart form data)
- POST /submission with payload.key -> server auto-approves and awards points when payload.key present

## Quick start (backend)
1. Open terminal and go to `backend/`
2. Install dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Start the backend:
   ```bash
   node server.js
   ```
   Backend will run at http://localhost:4000
4. Uploaded files will be stored in `backend/uploads/` and referenced by key returned by presign.

## Quick start (mobile)
1. Open a new terminal and go to `mobile/`
2. Install dependencies:
   ```bash
   cd mobile
   npm install
   ```
3. Start Expo:
   ```bash
   npx expo start
   ```
4. Run on Android emulator: use `a` in Expo devtools, or on iOS simulator use `i` (macOS), or scan the QR with Expo Go on your phone.
5. **Important:** The mobile app's API_BASE in App.js is set to `http://10.0.2.2:4000` (Android emulator). Update to `http://localhost:4000` for iOS simulator or `http://<YOUR_PC_IP>:4000` for physical device.

## Demo flow (camera upload)
1. In app, choose an action and tap **Take Photo & Submit**.
2. App will request a presign URL, upload the photo to the backend upload receiver, then submit the action referencing the uploaded key.
3. Backend auto-approves submissions with an uploaded key and awards points.

## Notes
- This is a demo presign flow suitable for local testing. In production, presigned URLs point to S3/GCS, and uploads are direct to S3 with limited expiry.
- For production: replace upload receiver with true presigned S3/GCS flows, implement background verification (OCR/CV), and secure auth.

