# managed-aws-educate-classroom

This project gives Educators have a centralized control to all student’s AWS Educate Classroom Account.

For Deployment and user guide, please check my blog post.

https://www.linkedin.com/pulse/how-use-managed-aws-educate-classroom-calendar-build-wong/


To upload sample template to managed-aws-educate-classroom-classroombucket

aws s3 sync ./cloudformation  s3://managed-aws-educate-classroom-classroombucket-1oykzdnmwtrln


## For Cloud9, we need to upgrade nodejs to verion 14.

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
nvm install 14