ROOT_DIR := $(abspath $(shell pwd)/../..)

IMAGE_NAME ?= indexer
IMAGE_TAG ?= latest
DOCKERFILE ?= $(ROOT_DIR)/packages/indexer/Dockerfile
CONTEXT ?= $(ROOT_DIR)
ENV_FILE ?= $(ROOT_DIR)/packages/indexer/.env

.PHONY: build run push

build:
	docker build -f $(DOCKERFILE) -t $(IMAGE_NAME):$(IMAGE_TAG) $(CONTEXT)

run:
ifdef ENV_FILE
	docker run --rm --env-file $(ENV_FILE) $(IMAGE_NAME):$(IMAGE_TAG)
else
	docker run --rm $(IMAGE_NAME):$(IMAGE_TAG)
endif

push:
	docker push $(IMAGE_NAME):$(IMAGE_TAG)
