# ParikshaSuraksha — One-Click Deploy / Destroy
#
# Usage:
#   make deploy          # Create VM, install everything, start services
#   make destroy         # Delete VM and all resources
#   make status          # Check if site is up
#   make ssh             # SSH into the VM
#   make logs            # View service logs

PROJECT_ID ?= lmsforshantithakur
REGION ?= asia-south1
ZONE ?= asia-south1-a

.PHONY: deploy destroy status ssh logs

deploy:
	@echo ">>> Deploying ParikshaSuraksha..."
	cd deploy && terraform init -input=false && \
		terraform apply -auto-approve \
			-var="project_id=$(PROJECT_ID)" \
			-var="region=$(REGION)" \
			-var="zone=$(ZONE)"
	@echo ""
	@echo ">>> VM created. Services starting (takes ~3 minutes)."
	@echo ">>> Run 'make status' to check when ready."

destroy:
	@echo ">>> Destroying ParikshaSuraksha..."
	cd deploy && terraform destroy -auto-approve \
		-var="project_id=$(PROJECT_ID)" \
		-var="region=$(REGION)" \
		-var="zone=$(ZONE)"
	@echo ">>> All resources destroyed."

status:
	@IP=$$(cd deploy && terraform output -raw ip 2>/dev/null) && \
	echo "VM IP: $$IP" && \
	echo "Landing:  $$(curl -s -o /dev/null -w '%{http_code}' http://$$IP/)" && \
	echo "About:    $$(curl -s -o /dev/null -w '%{http_code}' http://$$IP/about)" && \
	echo "Pitch:    $$(curl -s -o /dev/null -w '%{http_code}' http://$$IP/pitch)" && \
	echo "Admin:    $$(curl -s -o /dev/null -w '%{http_code}' http://$$IP/admin/dashboard)" && \
	echo "API:      $$(curl -s -o /dev/null -w '%{http_code}' http://$$IP/api/v1/health)" && \
	echo "" && \
	echo "URL: http://$$IP"

ssh:
	gcloud compute ssh pariksha-vm --zone=$(ZONE) --project=$(PROJECT_ID)

logs:
	gcloud compute ssh pariksha-vm --zone=$(ZONE) --project=$(PROJECT_ID) \
		--command="journalctl -u pariksha-api -u pariksha-portal -u pariksha-admin --no-pager -n 50"
