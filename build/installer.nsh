!macro customInstall
  SetOutPath "$INSTDIR"
  File "/oname=app-icon.ico" "${PROJECT_DIR}\\assets\\icon-uploader-v1\\generated\\icons\\icon.ico"
  IfFileExists "$EXEDIR\firebase-service-account.json" 0 +2
  CopyFiles /SILENT "$EXEDIR\firebase-service-account.json" "$INSTDIR\firebase-service-account.json"

  Delete "$DESKTOP\\Image Studio Uploader.lnk"
  CreateShortCut "$DESKTOP\\Image Studio Uploader.lnk" "$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\\app-icon.ico" 0

  CreateDirectory "$SMPROGRAMS\\Image Studio Uploader"
  Delete "$SMPROGRAMS\\Image Studio Uploader\\Image Studio Uploader.lnk"
  CreateShortCut "$SMPROGRAMS\\Image Studio Uploader\\Image Studio Uploader.lnk" "$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\\app-icon.ico" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\\Image Studio Uploader.lnk"
  Delete "$SMPROGRAMS\\Image Studio Uploader\\Image Studio Uploader.lnk"
  RMDir "$SMPROGRAMS\\Image Studio Uploader"
!macroend
