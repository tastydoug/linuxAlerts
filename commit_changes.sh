#!/bin/bash
cd /home/administrator/alerts-workspace
git add .
git commit -m "Implement fully dynamic alert types with unlimited custom categories

- Remove hardcoded alertBodies object limitations
- Add unlimited custom alert type support with automatic formatting
- Enhance getAlertBody() function with customType parameter
- Remove alert type validation restrictions
- Update /alert-types endpoint for dynamic discovery
- Add smart auto-detection for 11 keyword categories
- Update comprehensive documentation with dynamic examples
- Configure systemd service with automatic restart capabilities
- Update Postman collection with dynamic alert type examples
- Complete transformation from 8 fixed types to unlimited dynamic system"
echo "Git commit completed successfully"
