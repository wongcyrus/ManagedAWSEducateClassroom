SetupStudentAccountFunction=$(aws cloudformation describe-stacks --stack-name serverlessrepo-managed-aws-educate-classroom \
--query 'Stacks[0].Outputs[?OutputKey==`SetupStudentAccountFunction`].OutputValue' --output text)

echo "Setup Student Account and it should take a minute."
aws lambda invoke \
    --function-name $SetupStudentAccountFunction \
    --payload file://StudentAccount.json \
    SetupAccountResponse.json