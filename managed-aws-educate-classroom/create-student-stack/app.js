const AWS = require('aws-sdk');
const fs = require('fs');
const studentAccountTable = process.env.StudentAccountTable;
const dynamo = new AWS.DynamoDB.DocumentClient();

const createStudentLabStack = async(param) => {
    const { roleArn, templateFile, parameters } = param;
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
        StackName: 'Lab',
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
    const param = {
        roleArn: 'arn:aws:iam::300944606848:role/crossaccountteacher',
        templateFile: "cloud9.yaml",
        parameters: [{
                ParameterKey: 'EC2InstanceType',
                ParameterValue: "t2.micro"
            },
            {
                ParameterKey: 'OwnerArn',
                ParameterValue: "arn:aws:sts::300944606848:assumed-role/vocstartsoft/user114038=Chun_Yin,_Cyrus_Wong"
            }
        ]
    };
    await createStudentLabStack(param);
    return "OK";
};
