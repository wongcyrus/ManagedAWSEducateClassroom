const AWS = require('aws-sdk');
const studentAccountTable = process.env.StudentAccountTable;
const dynamo = new AWS.DynamoDB.DocumentClient();

const deleteStudentLabStack = async(param) => {
    const { roleArn, stackName } = param;
    const sts = new AWS.STS();
    const token = await sts.assumeRole({
        RoleArn: roleArn,
        RoleSessionName: 'studentAccount'
    }).promise();
    const cloudformation = new AWS.CloudFormation({
        accessKeyId: token.Credentials.AccessKeyId,
        secretAccessKey: token.Credentials.SecretAccessKey,
        sessionToken: token.Credentials.SessionToken,
        region: "us-east-1"
    });
    const params = {
        StackName: stackName
    };
    let response = await cloudformation.deleteStack(params).promise();
    console.log(response);
};

exports.lambdaHandler = async(event, context) => {

    let { stackName, classroomNumber, email } = event;
    let studentAccount = await dynamo.get({
        TableName: studentAccountTable,
        Key: {
            'classroomNumber': classroomNumber,
            'email': email
        }
    }).promise();
    console.log(studentAccount);
    const param = {
        stackName: stackName,
        roleArn: `arn:aws:iam::${studentAccount.Item.awsAccountId}:role/crossaccountteacher`,
    };
    await deleteStudentLabStack(param);
    return "OK";
};
