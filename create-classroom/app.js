const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const common = require('/opt/common');

const studentAccountTable = process.env.StudentAccountTable;
const createStudentStackFunctionArn = process.env.CreateStudentStackFunctionArn;

exports.lambdaHandler = async(event, context) => {
    let { classroomNumber, stackName, bucket, templateKey, parametersKey } = event;

    if (event.Records) {
        let { message, emailBody } = await common.getMessage(event);

        bucket = message.inboxBucket;
        stackName = emailBody.split('\n')[0];
        classroomNumber = message.slots.classroomNumber;

        templateKey = message.attachmentKeys.find(c => c.toLocaleLowerCase().endsWith(".yaml"));
        parametersKey = message.attachmentKeys.find(c => c.toLocaleLowerCase().endsWith(".json"));
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
    console.log(classroomNumber, stackName, templateKey, parametersKey);

    const createStack = async email => {
        let params = {
            FunctionName: createStudentStackFunctionArn,
            InvokeArgs: JSON.stringify({ classroomNumber, stackName, email, bucket, templateKey, parametersKey })
        };
        return await lambda.invokeAsync(params).promise();
    };

    let result = students.Items.map(s => createStack(s.email));
    console.log(await Promise.all(result));

    return "OK";
};
