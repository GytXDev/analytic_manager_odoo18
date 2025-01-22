from odoo import models, fields, api, _
from odoo.exceptions import ValidationError

class AnalyticDashboard(models.Model):
    _name = 'analytic.dashboard'
    _description = 'Tableau Analytique (Projet Unique)'

    exploitation = fields.Selection([
        ('libreville', 'Libreville'),
        ('moanda', 'Moanda'),
        ('port_gentil', 'Port-Gentil'),
    ], string="Exploitation")

    project_code = fields.Char(
        string="Code Projet", 
        required=True
    )

    libelle = fields.Char("Libellé")
    marche_initial = fields.Float("Marché Initial")
    ts = fields.Float("Travaux Supplémentaires")
    factures_cumulees = fields.Float("Factures Cumulées")
    od_facture = fields.Float("OD Facture")
    non_facture = fields.Float("Non Facturé")
    trop_facture = fields.Float("Trop Facturé")
    depenses_cumulees = fields.Float("Dépenses Cumulées")
    debours_previsionnels = fields.Float("Débours Prévisionnels")

    ca_final = fields.Float(
        string="CA Final (FCFA)", 
        compute='_compute_ca_final', 
        store=False
    )
    activite_cumulee = fields.Float(
        string="Activité Cumulée (FCFA)", 
        compute='_compute_activite_cumulee', 
        store=False
    )
    pourcentage_avancement = fields.Float(
        string="Avancement (%)", 
        compute='_compute_pourcentage_avancement', 
        store=False
    )
    resultat_chantier_cumule = fields.Float(
        string="Résultat Chantier Cumulé (FCFA)", 
        compute='_compute_resultat_chantier_cumule', 
        store=False
    )

    @api.depends('marche_initial', 'ts')
    def _compute_ca_final(self):
        for record in self:
            record.ca_final = round((record.marche_initial or 0) + (record.ts or 0), 2)

    @api.depends('factures_cumulees', 'od_facture', 'non_facture', 'trop_facture')
    def _compute_activite_cumulee(self):
        for record in self:
            record.activite_cumulee = round((
                (record.factures_cumulees or 0) +
                (record.od_facture or 0) +
                (record.non_facture or 0) -
                (record.trop_facture or 0)
            ), 2)

    @api.depends('activite_cumulee', 'ca_final')
    def _compute_pourcentage_avancement(self):
        for record in self:
            if record.ca_final:
                record.pourcentage_avancement = round((record.activite_cumulee / record.ca_final), 2)
            else:
                record.pourcentage_avancement = 0.0

    @api.depends('activite_cumulee', 'depenses_cumulees')
    def _compute_resultat_chantier_cumule(self):
        for record in self:
            record.resultat_chantier_cumule = round(record.activite_cumulee - (record.depenses_cumulees or 0), 2)

    @api.constrains('project_code')
    def _check_project_code(self):
        for record in self:
            if not record.project_code:
                raise ValidationError(_("Le code projet doit être renseigné."))
            if self.search_count([('project_code', '=', record.project_code)]) > 1:
                raise ValidationError(_("Le code projet doit être unique."))