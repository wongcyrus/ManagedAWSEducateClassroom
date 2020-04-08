const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const common = require('/opt/common');

const studentAccountTable = process.env.StudentAccountTable;
const deleteStudentStackFunctionArn = process.env.DeleteStudentStackFunctionArn;

exports.lambdaHandler = async(event, context) => {
    console.log(event);
    let { classroomName, stackName } = event;

    if (event.Records) {
        let snsMessage = await common.getSnsMessage(event);
        if (snsMessage.Source === "Calendar-Trigger") {
            ({ classroomName, stackName } = JSON.parse(snsMessage.desc));
        }
        else {
            let { message, emailBody } = await common.getSesInboxMessage(event);
            stackName = emailBody.split('\n')[0].trim();
            classroomName = message.slots.classroomName;
        }
    }

    let params = {
        TableName: studentAccountTable,
        KeyConditionExpression: 'classroomName = :hkey',
        ExpressionAttributeValues: {
            ':hkey': classroomName
        }
    };

    let students = await dynamo.query(params).promise();
    console.log(students);
    console.log(classroomName, stackName);

    const createStack = async email => {
        let params = {
            FunctionName: deleteStudentStackFunctionArn,
            InvokeArgs: JSON.stringify({ classroomName, stackName, email })
        };
        return await lambda.invokeAsync(params).promise();
    };

    let result = students.Items.map(s => createStack(s.email));
    console.log(await Promise.all(result));

    return "OK";
};
