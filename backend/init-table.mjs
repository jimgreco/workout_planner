import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  endpoint: process.env.AWS_ENDPOINT_URL_DYNAMODB || 'http://localhost:8000',
  region: process.env.AWS_REGION || 'us-east-1',
});

const tableName = process.env.TABLE_NAME || 'workout-planner';

async function init() {
  try {
    await client.send(new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
      },
    }));
    console.log(`Table "${tableName}" created successfully.`);
  } catch (err) {
    if (err.name === 'ResourceInUseException') {
      console.log(`Table "${tableName}" already exists.`);
    } else {
      console.error('Error creating table:', err);
      process.exit(1);
    }
  }
}

init();
