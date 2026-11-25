# Medusa: old reservations come back after a failed order edit

Plain Medusa 2.22.7, no customizations. Needs PostgreSQL with a superuser (the test runner creates databases and closes connections).

```bash
npm install
cp .env.test.template .env.test   # set your database user and password
npm test
```

`integration-tests/http/reservations.spec.ts` uses checkout and the admin API only. Both tests fail on 2.22.7:

- a failed order edit brings back the reservation an earlier edit deleted;
- the next fulfillment then counts both reservations and takes the stock twice.
