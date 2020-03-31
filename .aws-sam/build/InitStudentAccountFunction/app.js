const AWS = require('aws-sdk');
const fs = require('fs');
const studentAccountTable = process.env.StudentAccountTable;
const dynamo = new AWS.DynamoDB.DocumentClient();


const extractKeys = rawKey => {
    const accessKeyStartIndex = rawKey.indexOf("aws_access_key_id=") + "aws_access_key_id=".length;
    const accessKeyId = rawKey.substring(accessKeyStartIndex, rawKey.indexOf("aws_secret_access_key=")).replace(/(\r\n|\n|\r)/gm, "");
    const secretKeyStartIndex = rawKey.indexOf("aws_secret_access_key=") + "aws_secret_access_key=".length;
    const secretAccessKey = rawKey.substring(secretKeyStartIndex, rawKey.indexOf("aws_session_token=")).replace(/(\r\n|\n|\r)/gm, "");
    const secretSessionTokenIndex = rawKey.indexOf("aws_session_token=") + "aws_session_token=".length;
    const sessionToken = rawKey.substring(secretSessionTokenIndex).replace(/(\r\n|\n|\r)/gm, "");
    return { accessKeyId, secretAccessKey, sessionToken };
};

const initStudentAccount = async(email, rawKey) => {
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
    const params = {
        StackName: 'ManagedAWSEduateClassroom',
        Capabilities: [
            "CAPABILITY_IAM", "CAPABILITY_NAMED_IAM",
        ],
        Parameters: [{
            ParameterKey: 'TeacherAccountId',
            ParameterValue: Account
        }],
        TemplateBody: template
    };
    let response = await cloudformation.createStack(params).promise();
    console.log(response);

    let result = await dynamo.put({
        "TableName": studentAccountTable,
        "Item": {
            "id": email,
            "studentAccountArn": studentAcocuntIdentity.Arn,
            "awsAccountId": studentAcocuntIdentity.Account
        }
    });
    console.log(result);
};

exports.lambdaHandler = async(event, context) => {
    let key = event.key;
    await initStudentAccount("cywong@vtc.edu.hk", key);
    return "OK";
};
