const AWS = require('aws-sdk');
const classRoomAccountTable = process.env.ClassRoomAccountTable;
const dynamo = new AWS.DynamoDB.DocumentClient();

exports.lambdaHandler = async(event, context) => {
    let result = await dynamo.put({
        "TableName": classRoomAccountTable,
        "Item": {
            "id": event.name,
            "studentEmails": event.emails
        }
    }).promise();
    console.log(result);
    return "OK";
};
