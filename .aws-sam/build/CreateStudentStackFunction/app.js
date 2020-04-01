const AWS = require('aws-sdk');
const fs = require('fs');
const studentAccountTable = process.env.StudentAccountTable;
const dynamo = new AWS.DynamoDB.DocumentClient();

const createStudentLabStack = async(param) => {
    const { roleArn, templateFile, parameters, stackName, labStackCreationCompleteTopic } = param;
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
    const template = fs.readFileSync(templateFile, "utf8");
    const params = {
        StackName: stackName,
        NotificationARNs: [labStackCreationCompleteTopic],
        Capabilities: [
            "CAPABILITY_IAM", "CAPABILITY_NAMED_IAM",
        ],
        Parameters: parameters,
        TemplateBody: template
    };
    let response = await cloudformation.createStack(params).promise();
    console.log(response);
};

exports.lambdaHandler = async(event, context) => {
    let studentAccount = await dynamo.get({
        TableName: studentAccountTable,
        Key: { 'id': event.email }
    }).promise();
    console.log(studentAccount);
    const param = {
        stackName: event.stackName,
        labStackCreationCompleteTopic: studentAccount.Item.labStackCreationCompleteTopic,
        roleArn: `arn:aws:iam::${studentAccount.Item.awsAccountId}:role/crossaccountteacher`,
        templateFile: "cloud9.yaml",
        parameters: [{
                ParameterKey: 'EC2InstanceType',
                ParameterValue: "t2.micro"
            },
            {
                ParameterKey: 'OwnerArn',
                ParameterValue: studentAccount.Item.studentAccountArn
            }
        ]
    };
    await createStudentLabStack(param);
    return "OK";
};
