# Flexi Credit Course Forum Project

This is a simple forum, targeted towards college students.

Tech stack used:
- MongoDB
- React.JS
- Node.JS
- Express.JS

## Run with Docker

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:42370

## Run locally

Start MongoDB on `127.0.0.1:27017`, then:

```bash
cd backend && npm install && npm start
cd frontend && npm install && npm start
```

## Tests

The backend has Jest + Supertest unit and integration tests covering every API endpoint.
They run against an in-memory MongoDB, so no database setup is needed:

```bash
cd backend
npm install
npm test
```

Tests also run automatically on every push via GitHub Actions.
