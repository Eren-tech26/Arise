const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const options = {};

if (!uri) {
  throw new Error('Please add your MongoDB connection string to the MONGODB_URI environment variable');
}

let client;
let clientPromise;

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

module.exports = clientPromise;
