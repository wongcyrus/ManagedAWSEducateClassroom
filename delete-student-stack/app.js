const AWS = require('aws-sdk');
const studentAccountTable = process.env.StudentAccountTable;
const dynamo = new AWS.DynamoDB.DocumentClient();
const common = require('/opt/nodejs/common');

const deleteStudentLabStack = async(param) => {
    const { stackName, studentAwsAccountId, awsAccountId } = param;
    const credentials = await common.getCredentials(studentAwsAccountId, awsAccountId);
    const cloudformation = new AWS.CloudFormation(credentials);
    const params = {
        StackName: stackName
    };
    let response = await cloudformation.deleteStack(params).promise();
    console.log(response);
};

exports.lambdaHandler = async(event, context) => {

    let { stackName, classroomName, email } = event;
    let studentAccount = await dynamo.get({
        TableName: studentAccountTable,
        Key: {
            'classroomName': classroomName,
            'email': email
        }
    }).promise();
    console.log(studentAccount);
    const awsAccountId = context.invokedFunctionArn.split(":")[4];
    const param = {
        stackName: stackName,
        studentAwsAccountId: studentAccount.Item.awsAccountId,
        awsAccountId: awsAccountId,
    };
    await deleteStudentLabStack(param);
    return "OK";
};
