const {
  createApp,
  createDatabasePool,
  initializeDatabase
} = require("./server");

let databasePool;
let initialization;

function getDatabasePool() {
  if (!databasePool) databasePool = createDatabasePool();
  return databasePool;
}

const pool = {
  query(...args) {
    return getDatabasePool().query(...args);
  },
  execute(...args) {
    return getDatabasePool().execute(...args);
  },
  initialize() {
    if (!initialization) {
      initialization = initializeDatabase(getDatabasePool()).catch((error) => {
        initialization = undefined;
        throw error;
      });
    }
    return initialization;
  }
};

module.exports = createApp(pool);
