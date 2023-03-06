#!/bin/bash
rm deploy.tgz
tar --exclude="node_modules" -czvf deploy.tgz common server .env Dockerfile
