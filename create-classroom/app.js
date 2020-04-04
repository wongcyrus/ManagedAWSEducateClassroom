const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const common = require('/opt/common');

const studentAccountTable = process.env.StudentAccountTable;
const createStudentStackFunctionArn = process.env.CreateStudentStackFunctionArn;

exports.lambdaHandler = async(event, context) => {
    console.log(event);
    let { classroomName, stackName, bucket, templateKey, parametersKey } = event;

    if (event.Records) {
        let { message, emailBody } = await common.getMessage(event);

        bucket = message.inboxBucket;
        stackName = emailBody.split('\n')[0].trim();
        classroomName = message.slots.classroomName;

        templateKey = message.attachmentKeys.find(c => c.toLocaleLowerCase().endsWith(".yaml"));
        parametersKey = message.attachmentKeys.find(c => c.toLocaleLowerCase().endsWith(".json"));
    }

    console.log(classroomName, stackName, templateKey, parametersKey);
    
    let params = {
        TableName: studentAccountTable,
        KeyConditionExpression: 'classroomName = :hkey',
        ExpressionAttributeValues: {
            ':hkey': classroomName
        }
    };

    let students = await dynamo.query(params).promise();
    console.log(students);


    const createStack = async email => {
        let params = {
            FunctionName: createStudentStackFunctionArn,
            InvokeArgs: JSON.stringify({ classroomName, stackName, email, bucket, templateKey, parametersKey })
        };
        return await lambda.invokeAsync(params).promise();
    };

    let result = students.Items.map(s => createStack(s.email));
    console.log(await Promise.all(result));

    return "OK";
};
