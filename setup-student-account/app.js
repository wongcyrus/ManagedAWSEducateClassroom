const AWS = require('aws-sdk');
const fs = require('fs');
const studentAccountTable = process.env.StudentAccountTable;
const dynamo = new AWS.DynamoDB.DocumentClient();
const common = require('/opt/common');

const extractKeys = rawKey => {
    const accessKeyStartIndex = rawKey.indexOf("aws_access_key_id=") + "aws_access_key_id=".length;
    const accessKeyId = rawKey.substring(accessKeyStartIndex, rawKey.indexOf("aws_secret_access_key=")).replace(/(\r\n|\n|\r)/gm, "");
    const secretKeyStartIndex = rawKey.indexOf("aws_secret_access_key=") + "aws_secret_access_key=".length;
    const secretAccessKey = rawKey.substring(secretKeyStartIndex, rawKey.indexOf("aws_session_token=")).replace(/(\r\n|\n|\r)/gm, "");
    const secretSessionTokenIndex = rawKey.indexOf("aws_session_token=") + "aws_session_token=".length;
    const sessionToken = rawKey.substring(secretSessionTokenIndex, secretSessionTokenIndex + 368).replace(/(\r\n|\n|\r)/gm, "");
    return { accessKeyId, secretAccessKey, sessionToken };
};

const initStudentAccount = async(classroomNumber, email, rawKey) => {
    let sts = new AWS.STS();
    const { Account } = await sts.getCallerIdentity().promise();
    const { accessKeyId, secretAccessKey, sessionToken } = extractKeys(rawKey);

    sts = new AWS.STS({ accessKeyId, secretAccessKey, sessionToken });
    const studentAcocuntIdentity = await sts.getCallerIdentity().promise();
    const template = fs.readFileSync("InitStudentAccount.yaml", "utf8");
    const cloudformation = new AWS.CloudFormation({
        accessKeyId,
        secretAccessKey,
        sessionToken,
        region: "us-east-1"
    });
    let params = {
        StackName: 'ManagedAWSEduateClassroom',
        Capabilities: [
            "CAPABILITY_IAM", "CAPABILITY_NAMED_IAM",
        ],
        Parameters: [{
            ParameterKey: 'TeacherAccountId',
            ParameterValue: Account
        }, {
            ParameterKey: 'StudentEmail',
            ParameterValue: email
        }],
        TemplateBody: template
    };
    let response = await cloudformation.createStack(params).promise();

    params = {
        StackName: 'ManagedAWSEduateClassroom'
    };
    await cloudformation.waitFor('stackCreateComplete', params).promise();
    response = await cloudformation.describeStacks(params).promise();
    let labStackCreationCompleteTopic = response.Stacks[0].Outputs
        .find(c => c.OutputKey === "SNSTopicCloudFormation").OutputValue;

    console.log(classroomNumber, email, rawKey);

    let result = await dynamo.put({
        "TableName": studentAccountTable,
        "Item": {
            "classroomNumber": parseInt(classroomNumber, 10),
            "email": email,
            "studentAccountArn": studentAcocuntIdentity.Arn,
            "awsAccountId": studentAcocuntIdentity.Account,
            "labStackCreationCompleteTopic": labStackCreationCompleteTopic
        }
    }).promise();
    console.log(result);
};


exports.lambdaHandler = async(event, context) => {
    console.log(event);
    if (event.Records) {
        let { message, emailBody } = await common.getMessage(event);
        console.log(message);
        console.log(emailBody);
        await initStudentAccount(message.slots.classroomNumber, message.sender, emailBody);
    }
    await initStudentAccount(event.classroomNumber, event.email, event.key);
    return "OK";
};
