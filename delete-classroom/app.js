const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const common = require('/opt/common');

const studentAccountTable = process.env.StudentAccountTable;
const deleteStudentStackFunctionArn = process.env.DeleteStudentStackFunctionArn;
const stopInstanceFunctionArn = process.env.StopInstanceFunctionArn;

exports.lambdaHandler = async(event, context) => {
    console.log(event);
    let { classroomName, stackName, action } = event;

    if (event.Records) {
        let snsMessage = await common.getSnsMessage(event);
        if (snsMessage.Source === "Calendar-Trigger") {
            ({ classroomName, stackName, action } = JSON.parse(snsMessage.desc));
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

    const deleteStack = async email => {
        let params = {
            FunctionName: deleteStudentStackFunctionArn,
            InvokeArgs: JSON.stringify({ classroomName, stackName, email })
        };
        return await lambda.invokeAsync(params).promise();
    };

    const stopInstance = async email => {
        let params = {
            FunctionName: stopInstanceFunctionArn,
            InvokeArgs: JSON.stringify({ classroomName, stackName, email })
        };
        return await lambda.invokeAsync(params).promise();
    };

    if (action === "StartStop") {
        console.log("Stop Student Instance.");
        let result = students.Items.map(s => stopInstance(s.email));
        console.log(await Promise.all(result));
    }
    else {
        let result = students.Items.map(s => deleteStack(s.email));
        console.log(await Promise.all(result));
    }
    return "OK";
};
