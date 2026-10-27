岩性识别：看懂准确率背后的类别偏差
版本 1.0.0 / ready / 2026-10-26

安装：解压后，将case.json、README.txt及demo下五个文件（共七文件）一起导入老师网站；或直接打开demo/index.html。
站点已有文件内置插件，不必先手工上传。后台/接口/联网不是演示的运行条件。
脚本顺序：data.js → core.js → app.js；所有数据、样式和算法均在包内。
操作：默认验证井。选择井、观察训练回代/验证/冻结测试标记；复位恢复默认验证井和设置。
w4：训练/验证可试k=1/5/9/15，测试固定k=15、四模型特征。换显示轴或筛选只改变图，不改变全井指标。点散点、岩性柱、矩阵格联动；散点方向键移动、Enter选中、Esc清除。
评价：四类宏F1固定平均，未知参考不计分；已知参考拒判仍是错误。矩阵四类加未知行/拒判列。默认验证宏F1=20.40%，测试22.36%，高准确率不能掩盖小类失败；邻居投票占比不是校准概率。
数据为 FORCE 2020 教学子集：4训练/1验证/1测试，曲线 NLOD2.0，解释标签 CC BY4.0，样本来源及 SHA256 在 data.js。
数据网址：https://zenodo.org/records/4351156
原始仓库：https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition
标签是人工解释参考；本例不代表生产级解释或修复能力。默认模型只由训练拟合和验证选择，不在测试井调参。
可复现性：默认参数只由验证井选择，测试井不参与拟合或回调；四口训练井结果属于回代。

R07 publication rights and attribution
========================================
Project rights and third-party licences
======================================

Copyright (c) 2026 the respective petro-vis contributors.
All rights reserved for original project contributions unless a separate
licence is explicitly identified for a particular file or component.
Publication of the website and source repository does not itself grant a
blanket open-source licence. Statutory rights remain unaffected.

The supplied course framework, scene catalogue, original sample cases and
their adaptations remain subject to their respective authors' rights.
The supplied baseline did not include a separate open-source licence.
No MIT/Apache/Creative Commons licence is asserted for those components.

The FORCE 2020 well-log data and interpreted lithofacies labels retain
their existing third-party licences, independently of project code:

* Well-log curves: Norwegian Licence for Open Government Data (NLOD) 2.0.
  https://data.norge.no/nlod/en/2.0
* Interpreted lithofacies labels: Creative Commons Attribution 4.0
  International (CC BY 4.0).
  https://creativecommons.org/licenses/by/4.0/

These data licences are not restricted by the reservation of rights above.
This README contains the applicable attribution and licence information.
For data-bearing cases, full data licence texts follow below.


Data attribution and changes
------------------------------
# 来源、引用与第三方许可

## 课程框架与参考样例

本站基于课程提供的“石油勘探开发的智能化可能性地图”原生 HTML/CSS/JS 框架改进，保留 13 环节、61 场景及案例导入契约。原始框架、目录、测井分层参考样例和 `firstbreak-pick-case` 参考包来自课程材料，权利归原作者。提供的基线未附独立开源许可证，本项目不将其重新授予 MIT、Apache 或 CC 许可。老师样例不计入本人完成的五个案例。

## FORCE 2020 公开测井数据

来源与引用：Bormann P., Aursand P., Dilib F., Dischington P., Manral S. (2020). FORCE Machine Learning Competition.

- 原始发布仓库：https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition
- 长期归档：https://doi.org/10.5281/zenodo.4351156
- 指定来源声明：Lithofacies data was provided by the FORCE Machine Learning competition with well logs and seismic 2020.
- 原始井曲线：NLOD 2.0，https://data.norge.no/nlod/en/2.0
- 人工解释岩性标签：CC BY 4.0，https://creativecommons.org/licenses/by/4.0/
- 本地许可证全文：NLOD 2.0、CC BY 4.0（两份全文附于本 README 末尾）。

实际数据：原仓库 `lithology_competition/data/train.zip`。SHA256 为 `e996c8466f2d0dc7116daa71485cc90c31fcfac6345a5bb33165026478b642e9`；包内 `train.csv` SHA256 为 `f72eaa9d4d30b0990b553333baaac7d129f2a2c5bce96fd580b31592658641da`。

本项目修改：先仅按观测覆盖与连续性选取每井 500 点窗口，再按固定哈希选择 6 井并作 4 训/1 验/1 测拆分；标签合并/排除规则只由训练井决定。曲线保存四位小数，深度三位小数；没有插补或重采样。发布的是筛选、精度保存和标签映射后的教学子集，不是未经修改的完整原始数据。元信息见 包内 demo/data.js 的 source 与 selectionPolicy 字段。

前三个实验使用程序生成的合成数据；FORCE 子集仅用于岩性识别和测井数据修复。标签为人工解释参考，不等同逐点岩芯证据；许可方和数据贡献者未为本站或算法结果背书。

## 项目代码与图文

项目新增代码、图文与教学合成数据保留各自作者权利，当前没有统一授予开源许可证。公开展示与源码可见不改变上述权利范围；数据许可独立有效。详见 本 README 上方的项目权利说明。

站点运行不依赖第三方脚本库、CDN、在线字体、后端或 API；图表由原生 SVG/Canvas 与 JavaScript 绘制。系统字体由访问者设备提供。


============================================================
NLOD-2.0.txt
============================================================
Norwegian Licence for Open Government Data (NLOD) 2.0
Norwegian Digitalisation Agency
Official source: https://data.norge.no/nlod/en/2.0
Plain-text transcription of the official HTML; commentary retained.

This version:
https://data.norge.no/nlod/en/2.0
Latest published version (landing page):
https://data.norge.no/nlod
Previous version:
https://data.norge.no/nlod/en/1.0
Preface of licence
This licence grants you the right to copy, use and distribute information, provided you acknowledge the contributors and comply with the terms and conditions stipulated in this licence. By using information made available under this licence, you accept the terms and conditions set forth in this licence. As set out in Section 7, the licensor disclaims any and all liability for the quality of the information and what the information is used for.
This licence shall not impose any limitations on the rights or freedoms of the licensee under the Norwegian Freedom of Information Act or any other legislation granting the general public a right of access to public sector information, or that follow from exemptions or limitations stipulated in the Norwegian Copyright Act. Further, the licence shall not impose any limitations on the licensee’s freedom of expression recognized by law.
Comments:
The first sentence provides a brief introduction to the licence and points out key rights and obligations. The licence is primarily intended for use when public entities distribute data and other relevant content for further use by business and industry as well as civilian society.
The other sentence describes how the licence agreement is entered into. Use of copyrighted information requires a licence (a permit). Such a licence is granted when you enter into the licence agreement by using the information and thus become a licensee.
The third paragraph emphasises that the licence shall not deprive the licensee of any rights and freedoms pursuant to law. The intention behind the licence is to grant the licensee rights that he or she otherwise would not have, not to deprive the licensee of rights.
The terms and conditions stipulated in the licence are based on the assumption that the information thus distributed is protected under the Copyright Act or other legislation. If the information is exempt from copyright protection, e.g. under Section 9 of the Copyright Act, everyone is at liberty to freely use the information without having to comply with the terms and conditions set out in this licence.
This licence addresses the right to use information. It does not address access to information or terms of delivery.
1. Definitions
«Database»
shall mean a database or similar protected under Section 43 of the Norwegian Copyright Act.
«Information»
shall mean texts, 2.0/images, recordings, data sets or other works protected under Section 1 of the Norwegian Copyright Act, or which are protected under provisions addressing what is referred to as «neighbouring rights» in Chapter 5 of the Norwegian Copyright Act (including databases and photographs), and which are distributed under this licence.
«Copy»
shall mean reproduction in any form.
«Licensee» and «you»
shall mean natural or legal persons using information under this licence.
«Licensor»
shall mean the natural or legal person that makes information available under this licence.
«Distribute»
shall mean any actions whereby information is made available, including to distribute, transfer, communicate, disperse, show, perform, sell, lend and rent.
«Use»
shall mean one or more actions relevant to copyright law requiring permission from the owner of the copyright.
Comments:
Section 1 has various definitions used below in the licence. The defined term is indicated in bold. In the agreement, the term information is used as a generic term for everything offered for use under the licence. This may comprise various types of works such as copyrighted works (for example articles, novels, creative photographs, illustrations, etc.) as well as protected databases, tables, sound recordings, films, regular photographs, recordings of performances by performing artists, etc. The wording is general enough to cover computer programmes, but it is recommended that free licences adapted especially for computer programmes be used for these.
Because the licence will primarily be used for Open Government data, the word «data» has been used in the title of the licence. Thus, «Open Government data» must be understood to constitute a type of «information». The licence can, however, also be used for licensing of other types of information. As a consequence, the term « Open Government data» has been used only in the title, while the term «Information» is used in the licence itself.
In colloquial terms, the word «database» can also be used for certain types of catalogues which are protected as copyrighted works under Section 2 of the Copyright Act. The databases covered under Section 2 are covered by the definition of information. For such «databases», the Creative Commons licences will be compatible in accordance with Section 9 of this licence.
2. Licence
The licensee, subject to the limitations that follow from this licence, may use the information for any purpose and in all contexts, by:
copying the information and distributing the information to others,
modifying the information and/or combining the information with other information, and
copying and distributing such changed or combined information.
This is a non-exclusive, free, perpetual and worldwide licence. The information may be used in any medium and format known today and/or which will become known in the future. The Licensee shall not sub-license or transfer this licence.
Comments:
In Section 2 the licensee is granted a very extensive and liberal right to use the information. The licensee may share the information with others, change the information and use the information in the way he or she wants to. The only exception is if the licensor is not entitled to license the information under this licence; i.e. a mistake has been made. Please refer to Section 3 for further details.
In the last sentence it is specified that the licensee is not entitled to sub-license or transfer this licence. This entails that this licence does not grant the licensee permission to grant others permission to use the information. The licensee does not have permission to change the terms and conditions for use of the information. Although the licensee has the right to transfer the information under this licence, the party receiving such information must obtain permission from the original licensor to be able to use the information. In practice, this means that the terms and conditions of this licence apply regardless of whom you receive the information from.
3. Exemptions
The licence does not apply to and therefore does not grant a right to use:
information which contains personal data covered by the Norwegian Personal Data Act unless there is a legitimate basis for the disclosure and further processing of the personal data
information distributed in violation of a statutory obligation to observe confidentiality
information excluded from public disclosure pursuant to law, including information deemed sensitive under the Norwegian National Security Act
information subject to third party rights which the licensor is not authorised to license to the licensee
information protected by intellectual property rights other than copyright and neighbouring rights in accordance with Chapter 5 of the Norwegian Copyright Act, such as trademarks, patents and design rights, but this does not entail an impediment to use information where the licensor’s logo has been permanently integrated into the information or to attribute the origin of the information in accordance with the article below relating to attribution.
If the licensor has made available information not covered by the licence according to the above list, the licensee must cease all use of the information under the licence, and erase the information as soon as he or she becomes aware of or should have understood that the information is not covered by the licence.
Comments:
This licence is to be used for information which can be re-used. It shall not and cannot be used for information exempt from public disclosure in any way. If such information has been distributed under this licence, it will be because a mistake has been made. The licence does not apply for information of this type. Thus, it is not permissible to use this type of information by virtue of the licence.
The licensee must be able to assume that the licensor has made a pre-assessment of whether the information can be distributed or not. However, it must be possible to hold the licensee responsible for distributing the information if the licensee should have understood that the information was distributed by mistake.
Publication of «information subject to third party rights which the licensor is not authorised to license to the licensee» entails that the licensor is not the owner of the copyright to the information and that he has not been granted a sufficient licence from the owner of the copyright.
4. Effects of breach of the licence
The licence is subject to the licensee’s compliance with the terms and conditions of this licence. In the event that the licensee commits a breach of this licence, this will entail that the licensee’s right to use the information will be revoked immediately without further notice. In case of such a breach, the licensee must immediately and without further notice take measures to cause the infringement to end. Because the right to use the information has been terminated, the licensee must cease all use of the information by virtue of the licence.
Comments:
If the licensee does not fulfil the obligations under the licence agreement, the permit to use the information is revoked. The licensee must then cease to share and use the information. However, parties having received information from a party in breach of the licence may continue to use the information as long as their use is in conformity with the licence agreement.
5. Attribution
The licensee shall attribute the licensor as specified by the licensor and include a reference to this licence. To the extent practically possible, the licensee shall provide a link to both this licence and the source of the information.
If the licensor has not specified how attributions shall be made, the licensee shall normally state the following: «Contains data under the Norwegian licence for Open Government data (NLOD) distributed by [name of licensor]».
If the licensor has specified that the information shall only be available under a specific version of this licence, cf. Section 10, the licensee shall also state this.
If the information has been changed, the licensee must clearly indicate that changes have been made by the licensee.
Comments:
This provision stipulates that the licensee must state the source of the information, and that this must be stated as specified in the licence if the licensor has not specified otherwise.
The provision that it must be «practically possible» to provide a link to this licence and to the source of the information entails, for example, that the licensee need not provide a link when the information is not distributed in an electronic format.
Thus, the licence requires an attribution statement, and describes how this is to be implemented, but it does not specify where this attribution statement must be positioned. This entails that the attribution statement need not be placed on the same page as the information, as it is sufficient that the reference to the source be placed on an «About» page, etc. It is also not a requirement that each individual data element be listed. Such a requirement would have rendered it difficult to comply with the attribution requirement in cases where data from several different sources are presented on a map, for example. The sources may instead be stated below the map, on an «About» page, etc. However, the reference to the source must not be hidden or difficult to find.
If the licensee has changed the information, this must be indicated, for example in this manner: «Contains data under the Norwegian licence for Open Government Data (NLOD) distributed by [name of licensor]. Nils Klim has changed the information by cross-cutting it with user-generated content.»
6. Proper use
The licensee shall not use the information in a manner that appears misleading nor present the information in a distorted or incorrect manner.
Neither the licensor’s nor other contributors' names or trademarks must be used to support, recommend or market the licensee or any products or services using the information.
Comments:
This provision addresses the fact that the licensee must use the information in a prudent manner. The information cannot be changed, for example, and then be presented as if it has not been changed. The requirement that the information not be presented in an incorrect manner, entails that the licensee must familiarize himself with how to correctly interpret and understand the information. If the data is misunderstood and/or used incorrectly, any incorrect elements must be remedied as soon as one becomes aware of or should have understood that the information has been presented in an incorrect manner.
This provision must also be viewed in the context of existing regulations relating to misleading marketing, deception, etc.
7. Disclaimer of liability
The information is licensed «as is». The information may contain errors and omissions. The licensor provides no warranties, including relating to the content and relevance of the information.
The licensor disclaims any liability for errors and defects associated with the information to the maximum extent permitted by law.
The licensor shall not be liable for direct or indirect losses as a result of use of the information or in connection with copying or further distribution of the information.
Comments:
This provision addresses the fact that the licensor assumes no economic liability for the information. This entails, inter alia, that the licensor does not assume liability for the correctness or completeness of the information.
The licensor also does not assume liability for how the information is used or for the consequences of any use.
As the licence agreement does not address access to the information, the licensor also does not assume liability for the information being accessible. This provision has a wide scope and also applies to situations not listed here.
8. Guarantees regarding data quality and accessibility
This licence does not prevent the licensor from issuing supplementary statements regarding expected or intended data quality and accessibility. Such statements shall be regarded as indicative in nature and not binding on the part of the licensor. The disclaimers in Section 7 also apply in full for such indicative statements. Based on separate agreement, the licensor may provide guarantees and distribute the information on terms and conditions different from those set forth in this licence.
Comments:
It follows from Section 8 that the licensor may provide supplementary statements regarding expected or intended data quality and accessibility. Such statements are indicative in nature and not binding for the licensor. They may be statements such as the following: «The information is normally updated at least once a month. We intend for the information to be accessible until 27 May 2664. We normally have an uptime of 99% measured in minutes per calendar month.»
If the licensee would like the licensor to warrant e.g. data quality and accessibility, such warranties must be made in a separate agreement between the licensor and the licensee.
9. Licence compatibility
If the licensee is to distribute an adapted or combined work based on information covered by this licence and some other work licensed under a licence compatible by contract, such distribution may be based on an appropriate licence compatible by contract, cf. the list below.
A licence compatible by contract shall mean the following licences:
for all information: Open Government Licence (version 1.0, 2.0 and 3.0), Creative Commons Attribution Licence (international version 4.0 and norwegian version 4.0),
for those parts of the information which do not constitute databases: Creative Commons Attribution Licence (generic version 1.0, 2.0, 2.5 and unported version 3.0) and Creative Commons Navngivelse 3.0 Norge,
for those parts of the information which constitute databases: Open Data Commons Attribution License (version 1.0).
This provision does not prevent other licences from being compatible with this licence based on their content.
Comments:
The purpose of this Section is to specify that information licensed under NLOD may be used together with information licensed under one of the licences listed. If a data set has been distributed under NLOD and another data set has been distributed under OGL or CC-BY 4.0, these may be combined and re-published under one of these licences.
Another example is if you use 2.0/images covered by NLOD together with your own 2.0/images and 2.0/images under the Creative Commons Attribution Licence (CC-BY) in a collage. The entire collage may then be licensed under the CC-BY licence. In such a case, you must make sure to state the name of the licensor for the 2.0/images originally licensed under NLOD, your own name, and the name of the licensor for the 2.0/images under CC-BY as well as comply with the other licence terms and conditions.
This provision makes a distinction between rights linked to databases and other rights. If you distribute a database under a Creative Commons 3.0 licence, you may waive protection of the database, as it follows from Creative Commons (CC-BY 3.0 NO): «If the licensor has database rights or similar in pursuance of Section 43 of the (Norwegian) Copyright Act and EU’s Database Directive, the licensor waives these rights.» The licence is therefore not «compatible» with Creative Commons for databases per se. However, the licence agreement does not prevent the licensee from using individual elements / some content from the database. The provision on licence compatibility with Creative Commons may be applied for such elements.
10. New versions of the licence
The licensee may choose to use the information covered by this licence under any new versions of the Norwegian licence for Open Government data (NLOD) issued by the responsible ministry (currently the Ministry of Local Government and Modernisation) when these versions are final and official, unless the licensor when making the information available under this licence specifically has stated that solely version 2.0 of this licence may be used.
Comments:
The Ministry of Local Government and Modernisation (or any ministry which subsequently assumes this responsibility) may issue new versions of the licence, for example based on new experience, a desire to cover new needs or to ensure compatibility with new or other relevant licences.
The licensee is entitled, but not obligated, to use the information under any new licences issued, unless the licensor has made the reservation that the information will solely be available under version 2.0 of the licence.
If the licensor has stated that only a specific version of the licence is to be used, this must also be stated by the licensee. This can be done by stating, for example: «Contains data under the Norwegian licence for Open Government Data (NLOD) distributed by [name of licensor], licensed solely under version 2.0 of the licence.»
To ensure the information does not become «stranded» under old terms and conditions and thus become «abandoned data», such reservations should only be used when absolutely necessary.
11. Governing law and legal venue
This licence, including its formation, and any disputes and claims arising in connection with or relating to this licence, shall be regulated by Norwegian law. The legal venue shall be the licensor’s ordinary legal venue. The licensor may, with regard to intellectual proprietary rights, choose to pursue a claim at other competent legal venues and/or based on the laws of the country where the intellectual property rights are sought enforced.
Comments:
As a point of departure, the licence agreement is subject to Norwegian law and legal proceedings must take place at the licensor’s ordinary legal venue. For the Norwegian Government, this is Oslo District Court.
The information licensed may be used worldwide and by licensees from all parts of the world. In order to strengthen the enforcement, the licence also allows the licensor to pursue breaches of the licence at courts in other countries and also based on their copyright laws, etc.


============================================================
CC-BY-4.0.txt
============================================================
Attribution 4.0 International

=======================================================================

Creative Commons Corporation ("Creative Commons") is not a law firm and
does not provide legal services or legal advice. Distribution of
Creative Commons public licenses does not create a lawyer-client or
other relationship. Creative Commons makes its licenses and related
information available on an "as-is" basis. Creative Commons gives no
warranties regarding its licenses, any material licensed under their
terms and conditions, or any related information. Creative Commons
disclaims all liability for damages resulting from their use to the
fullest extent possible.

Using Creative Commons Public Licenses

Creative Commons public licenses provide a standard set of terms and
conditions that creators and other rights holders may use to share
original works of authorship and other material subject to copyright
and certain other rights specified in the public license below. The
following considerations are for informational purposes only, are not
exhaustive, and do not form part of our licenses.

     Considerations for licensors: Our public licenses are
     intended for use by those authorized to give the public
     permission to use material in ways otherwise restricted by
     copyright and certain other rights. Our licenses are
     irrevocable. Licensors should read and understand the terms
     and conditions of the license they choose before applying it.
     Licensors should also secure all rights necessary before
     applying our licenses so that the public can reuse the
     material as expected. Licensors should clearly mark any
     material not subject to the license. This includes other CC-
     licensed material, or material used under an exception or
     limitation to copyright. More considerations for licensors:
    wiki.creativecommons.org/Considerations_for_licensors

     Considerations for the public: By using one of our public
     licenses, a licensor grants the public permission to use the
     licensed material under specified terms and conditions. If
     the licensor's permission is not necessary for any reason--for
     example, because of any applicable exception or limitation to
     copyright--then that use is not regulated by the license. Our
     licenses grant only permissions under copyright and certain
     other rights that a licensor has authority to grant. Use of
     the licensed material may still be restricted for other
     reasons, including because others have copyright or other
     rights in the material. A licensor may make special requests,
     such as asking that all changes be marked or described.
     Although not required by our licenses, you are encouraged to
     respect those requests where reasonable. More considerations
     for the public:
    wiki.creativecommons.org/Considerations_for_licensees

=======================================================================

Creative Commons Attribution 4.0 International Public License

By exercising the Licensed Rights (defined below), You accept and agree
to be bound by the terms and conditions of this Creative Commons
Attribution 4.0 International Public License ("Public License"). To the
extent this Public License may be interpreted as a contract, You are
granted the Licensed Rights in consideration of Your acceptance of
these terms and conditions, and the Licensor grants You such rights in
consideration of benefits the Licensor receives from making the
Licensed Material available under these terms and conditions.


Section 1 -- Definitions.

  a. Adapted Material means material subject to Copyright and Similar
     Rights that is derived from or based upon the Licensed Material
     and in which the Licensed Material is translated, altered,
     arranged, transformed, or otherwise modified in a manner requiring
     permission under the Copyright and Similar Rights held by the
     Licensor. For purposes of this Public License, where the Licensed
     Material is a musical work, performance, or sound recording,
     Adapted Material is always produced where the Licensed Material is
     synched in timed relation with a moving image.

  b. Adapter's License means the license You apply to Your Copyright
     and Similar Rights in Your contributions to Adapted Material in
     accordance with the terms and conditions of this Public License.

  c. Copyright and Similar Rights means copyright and/or similar rights
     closely related to copyright including, without limitation,
     performance, broadcast, sound recording, and Sui Generis Database
     Rights, without regard to how the rights are labeled or
     categorized. For purposes of this Public License, the rights
     specified in Section 2(b)(1)-(2) are not Copyright and Similar
     Rights.

  d. Effective Technological Measures means those measures that, in the
     absence of proper authority, may not be circumvented under laws
     fulfilling obligations under Article 11 of the WIPO Copyright
     Treaty adopted on December 20, 1996, and/or similar international
     agreements.

  e. Exceptions and Limitations means fair use, fair dealing, and/or
     any other exception or limitation to Copyright and Similar Rights
     that applies to Your use of the Licensed Material.

  f. Licensed Material means the artistic or literary work, database,
     or other material to which the Licensor applied this Public
     License.

  g. Licensed Rights means the rights granted to You subject to the
     terms and conditions of this Public License, which are limited to
     all Copyright and Similar Rights that apply to Your use of the
     Licensed Material and that the Licensor has authority to license.

  h. Licensor means the individual(s) or entity(ies) granting rights
     under this Public License.

  i. Share means to provide material to the public by any means or
     process that requires permission under the Licensed Rights, such
     as reproduction, public display, public performance, distribution,
     dissemination, communication, or importation, and to make material
     available to the public including in ways that members of the
     public may access the material from a place and at a time
     individually chosen by them.

  j. Sui Generis Database Rights means rights other than copyright
     resulting from Directive 96/9/EC of the European Parliament and of
     the Council of 11 March 1996 on the legal protection of databases,
     as amended and/or succeeded, as well as other essentially
     equivalent rights anywhere in the world.

  k. You means the individual or entity exercising the Licensed Rights
     under this Public License. Your has a corresponding meaning.


Section 2 -- Scope.

  a. License grant.

       1. Subject to the terms and conditions of this Public License,
          the Licensor hereby grants You a worldwide, royalty-free,
          non-sublicensable, non-exclusive, irrevocable license to
          exercise the Licensed Rights in the Licensed Material to:

            a. reproduce and Share the Licensed Material, in whole or
               in part; and

            b. produce, reproduce, and Share Adapted Material.

       2. Exceptions and Limitations. For the avoidance of doubt, where
          Exceptions and Limitations apply to Your use, this Public
          License does not apply, and You do not need to comply with
          its terms and conditions.

       3. Term. The term of this Public License is specified in Section
          6(a).

       4. Media and formats; technical modifications allowed. The
          Licensor authorizes You to exercise the Licensed Rights in
          all media and formats whether now known or hereafter created,
          and to make technical modifications necessary to do so. The
          Licensor waives and/or agrees not to assert any right or
          authority to forbid You from making technical modifications
          necessary to exercise the Licensed Rights, including
          technical modifications necessary to circumvent Effective
          Technological Measures. For purposes of this Public License,
          simply making modifications authorized by this Section 2(a)
          (4) never produces Adapted Material.

       5. Downstream recipients.

            a. Offer from the Licensor -- Licensed Material. Every
               recipient of the Licensed Material automatically
               receives an offer from the Licensor to exercise the
               Licensed Rights under the terms and conditions of this
               Public License.

            b. No downstream restrictions. You may not offer or impose
               any additional or different terms or conditions on, or
               apply any Effective Technological Measures to, the
               Licensed Material if doing so restricts exercise of the
               Licensed Rights by any recipient of the Licensed
               Material.

       6. No endorsement. Nothing in this Public License constitutes or
          may be construed as permission to assert or imply that You
          are, or that Your use of the Licensed Material is, connected
          with, or sponsored, endorsed, or granted official status by,
          the Licensor or others designated to receive attribution as
          provided in Section 3(a)(1)(A)(i).

  b. Other rights.

       1. Moral rights, such as the right of integrity, are not
          licensed under this Public License, nor are publicity,
          privacy, and/or other similar personality rights; however, to
          the extent possible, the Licensor waives and/or agrees not to
          assert any such rights held by the Licensor to the limited
          extent necessary to allow You to exercise the Licensed
          Rights, but not otherwise.

       2. Patent and trademark rights are not licensed under this
          Public License.

       3. To the extent possible, the Licensor waives any right to
          collect royalties from You for the exercise of the Licensed
          Rights, whether directly or through a collecting society
          under any voluntary or waivable statutory or compulsory
          licensing scheme. In all other cases the Licensor expressly
          reserves any right to collect such royalties.


Section 3 -- License Conditions.

Your exercise of the Licensed Rights is expressly made subject to the
following conditions.

  a. Attribution.

       1. If You Share the Licensed Material (including in modified
          form), You must:

            a. retain the following if it is supplied by the Licensor
               with the Licensed Material:

                 i. identification of the creator(s) of the Licensed
                    Material and any others designated to receive
                    attribution, in any reasonable manner requested by
                    the Licensor (including by pseudonym if
                    designated);

                ii. a copyright notice;

               iii. a notice that refers to this Public License;

                iv. a notice that refers to the disclaimer of
                    warranties;

                 v. a URI or hyperlink to the Licensed Material to the
                    extent reasonably practicable;

            b. indicate if You modified the Licensed Material and
               retain an indication of any previous modifications; and

            c. indicate the Licensed Material is licensed under this
               Public License, and include the text of, or the URI or
               hyperlink to, this Public License.

       2. You may satisfy the conditions in Section 3(a)(1) in any
          reasonable manner based on the medium, means, and context in
          which You Share the Licensed Material. For example, it may be
          reasonable to satisfy the conditions by providing a URI or
          hyperlink to a resource that includes the required
          information.

       3. If requested by the Licensor, You must remove any of the
          information required by Section 3(a)(1)(A) to the extent
          reasonably practicable.

       4. If You Share Adapted Material You produce, the Adapter's
          License You apply must not prevent recipients of the Adapted
          Material from complying with this Public License.


Section 4 -- Sui Generis Database Rights.

Where the Licensed Rights include Sui Generis Database Rights that
apply to Your use of the Licensed Material:

  a. for the avoidance of doubt, Section 2(a)(1) grants You the right
     to extract, reuse, reproduce, and Share all or a substantial
     portion of the contents of the database;

  b. if You include all or a substantial portion of the database
     contents in a database in which You have Sui Generis Database
     Rights, then the database in which You have Sui Generis Database
     Rights (but not its individual contents) is Adapted Material; and

  c. You must comply with the conditions in Section 3(a) if You Share
     all or a substantial portion of the contents of the database.

For the avoidance of doubt, this Section 4 supplements and does not
replace Your obligations under this Public License where the Licensed
Rights include other Copyright and Similar Rights.


Section 5 -- Disclaimer of Warranties and Limitation of Liability.

  a. UNLESS OTHERWISE SEPARATELY UNDERTAKEN BY THE LICENSOR, TO THE
     EXTENT POSSIBLE, THE LICENSOR OFFERS THE LICENSED MATERIAL AS-IS
     AND AS-AVAILABLE, AND MAKES NO REPRESENTATIONS OR WARRANTIES OF
     ANY KIND CONCERNING THE LICENSED MATERIAL, WHETHER EXPRESS,
     IMPLIED, STATUTORY, OR OTHER. THIS INCLUDES, WITHOUT LIMITATION,
     WARRANTIES OF TITLE, MERCHANTABILITY, FITNESS FOR A PARTICULAR
     PURPOSE, NON-INFRINGEMENT, ABSENCE OF LATENT OR OTHER DEFECTS,
     ACCURACY, OR THE PRESENCE OR ABSENCE OF ERRORS, WHETHER OR NOT
     KNOWN OR DISCOVERABLE. WHERE DISCLAIMERS OF WARRANTIES ARE NOT
     ALLOWED IN FULL OR IN PART, THIS DISCLAIMER MAY NOT APPLY TO YOU.

  b. TO THE EXTENT POSSIBLE, IN NO EVENT WILL THE LICENSOR BE LIABLE
     TO YOU ON ANY LEGAL THEORY (INCLUDING, WITHOUT LIMITATION,
     NEGLIGENCE) OR OTHERWISE FOR ANY DIRECT, SPECIAL, INDIRECT,
     INCIDENTAL, CONSEQUENTIAL, PUNITIVE, EXEMPLARY, OR OTHER LOSSES,
     COSTS, EXPENSES, OR DAMAGES ARISING OUT OF THIS PUBLIC LICENSE OR
     USE OF THE LICENSED MATERIAL, EVEN IF THE LICENSOR HAS BEEN
     ADVISED OF THE POSSIBILITY OF SUCH LOSSES, COSTS, EXPENSES, OR
     DAMAGES. WHERE A LIMITATION OF LIABILITY IS NOT ALLOWED IN FULL OR
     IN PART, THIS LIMITATION MAY NOT APPLY TO YOU.

  c. The disclaimer of warranties and limitation of liability provided
     above shall be interpreted in a manner that, to the extent
     possible, most closely approximates an absolute disclaimer and
     waiver of all liability.


Section 6 -- Term and Termination.

  a. This Public License applies for the term of the Copyright and
     Similar Rights licensed here. However, if You fail to comply with
     this Public License, then Your rights under this Public License
     terminate automatically.

  b. Where Your right to use the Licensed Material has terminated under
     Section 6(a), it reinstates:

       1. automatically as of the date the violation is cured, provided
          it is cured within 30 days of Your discovery of the
          violation; or

       2. upon express reinstatement by the Licensor.

     For the avoidance of doubt, this Section 6(b) does not affect any
     right the Licensor may have to seek remedies for Your violations
     of this Public License.

  c. For the avoidance of doubt, the Licensor may also offer the
     Licensed Material under separate terms or conditions or stop
     distributing the Licensed Material at any time; however, doing so
     will not terminate this Public License.

  d. Sections 1, 5, 6, 7, and 8 survive termination of this Public
     License.


Section 7 -- Other Terms and Conditions.

  a. The Licensor shall not be bound by any additional or different
     terms or conditions communicated by You unless expressly agreed.

  b. Any arrangements, understandings, or agreements regarding the
     Licensed Material not stated herein are separate from and
     independent of the terms and conditions of this Public License.


Section 8 -- Interpretation.

  a. For the avoidance of doubt, this Public License does not, and
     shall not be interpreted to, reduce, limit, restrict, or impose
     conditions on any use of the Licensed Material that could lawfully
     be made without permission under this Public License.

  b. To the extent possible, if any provision of this Public License is
     deemed unenforceable, it shall be automatically reformed to the
     minimum extent necessary to make it enforceable. If the provision
     cannot be reformed, it shall be severed from this Public License
     without affecting the enforceability of the remaining terms and
     conditions.

  c. No term or condition of this Public License will be waived and no
     failure to comply consented to unless expressly agreed to by the
     Licensor.

  d. Nothing in this Public License constitutes or may be interpreted
     as a limitation upon, or waiver of, any privileges and immunities
     that apply to the Licensor or You, including from the legal
     processes of any jurisdiction or authority.


=======================================================================

Creative Commons is not a party to its public
licenses. Notwithstanding, Creative Commons may elect to apply one of
its public licenses to material it publishes and in those instances
will be considered the “Licensor.” The text of the Creative Commons
public licenses is dedicated to the public domain under the CC0 Public
Domain Dedication. Except for the limited purpose of indicating that
material is shared under a Creative Commons public license or as
otherwise permitted by the Creative Commons policies published at
creativecommons.org/policies, Creative Commons does not authorize the
use of the trademark "Creative Commons" or any other trademark or logo
of Creative Commons without its prior written consent including,
without limitation, in connection with any unauthorized modifications
to any of its public licenses or any other arrangements,
understandings, or agreements concerning use of licensed material. For
the avoidance of doubt, this paragraph does not form part of the
public licenses.

Creative Commons may be contacted at creativecommons.org.


