const AWS = require('aws-sdk');
const classRoomAccountTable = process.env.ClassRoomAccountTable;
const dynamo = new AWS.DynamoDB.DocumentClient();

const common = require('/opt/common');

exports.lambdaHandler = async(event, context) => {

    if (event.Records) {
        let { message, emailBody } = common.getMessage(event);
        console.log(message, emailBody);
    }

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
