const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const common = require('/opt/common');

const studentAccountTable = process.env.StudentAccountTable;
const deleteStudentStackFunctionArn = process.env.DeleteStudentStackFunctionArn;

exports.lambdaHandler = async(event, context) => {
    let { classroomNumber, stackName } = event;

    if (event.Records) {
        let { message, emailBody } = await common.getMessage(event);
        stackName = emailBody.split('\n')[0].trim();
        classroomNumber = message.slots.classroomNumber;
    }

    classroomNumber = parseInt(classroomNumber, 10);
    let params = {
        TableName: studentAccountTable,
        KeyConditionExpression: 'classroomNumber = :hkey',
        ExpressionAttributeValues: {
            ':hkey': classroomNumber
        }
    };

    let students = await dynamo.query(params).promise();
    console.log(students);
    console.log(classroomNumber, stackName);

    const createStack = async email => {
        let params = {
            FunctionName: deleteStudentStackFunctionArn,
            InvokeArgs: JSON.stringify({ classroomNumber, stackName, email })
        };
        return await lambda.invokeAsync(params).promise();
    };

    let result = students.Items.map(s => createStack(s.email));
    console.log(await Promise.all(result));

    return "OK";
};
