const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const studentAccountTable = process.env.StudentAccountTable;
const common = require('/opt/nodejs/common');


const stopStudentInstance = async(param) => {
    const { stackName , studentAwsAccountId, awsAccountId } = param;
    const credentials = await common.getCredentials(studentAwsAccountId, awsAccountId);
    const cloudformation = new AWS.CloudFormation(credentials);
    let response = await cloudformation.describeStackResources({
        StackName: stackName
    }).promise();
    const instanceIds = response.StackResources.filter(c => c.ResourceType === "AWS::EC2::Instance").map(c => c.PhysicalResourceId);
    console.log(instanceIds);

    const ec2 = new AWS.EC2(credentials);
    response = await ec2.stopInstances({
        InstanceIds: instanceIds
    }).promise();
    console.log(response);
};

exports.lambdaHandler = async(event, context) => {
    console.log(event);
    let { classroomName, stackName, email } = event;

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
        stackName,
        studentAwsAccountId: studentAccount.Item.awsAccountId,
        awsAccountId: awsAccountId,
    };
    await stopStudentInstance(param);
    return "OK";
};
