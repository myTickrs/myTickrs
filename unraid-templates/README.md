# myTickrs Unraid templates

Unraid Community Applications templates for [myTickrs](https://github.com/myTickrs/myTickrs).

## Manual install

Install the template file directly:

1. Open a terminal on the Unraid server (the **>_** icon at the top right) and run:

   ```sh
   wget -O /boot/config/plugins/dockerMan/templates-user/my-mytickrs.xml \
     https://raw.githubusercontent.com/myTickrs/myTickrs/main/unraid-templates/mytickrs.xml
   ```

2. Go to **Docker → Add Container**.
3. In the **Template** dropdown, under **User templates**, pick **my-mytickrs**.
4. Review the settings and click **Apply**.

To update the template later, run the `wget` command again.

Support: see the `<Support>` link in [mytickrs.xml](mytickrs.xml).
